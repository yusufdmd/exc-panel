// =====================================================================
// EXC PANELİ — aiChat.js
// =====================================================================
// "AI Asistan" sekmesi — adminlerin panelden ayrılmadan Gemini ile serbest
// sohbet edebildiği, sadece adminlerin erişebildiği bir bölüm (bkz.
// sql/add_ai_chat_messages.sql). Her admin'in geçmişi RLS ile KENDİSİNE
// özeldir (author_id = auth.uid()) — diğer adminler göremez, bu dosya
// ayrıca bir filtreleme yapmaz çünkü Supabase zaten sadece kendi
// satırlarını döndürür/kabul eder.
//
// Gemini çağrısının kendisi api/ai-chat.js üzerinden (admin token'ı
// doğrulanarak) yapılır — anahtar (GEMINI_API_KEY) tarayıcıya hiç gitmez.
// Mesajların veritabanına yazılması ise BURADAN, admin'in kendi Supabase
// oturumuyla, doğrudan yapılır (diğer admin-only tablolarla aynı desen).
//
// İki mod var (state.aiChatMode): "text" (Gemini ile sohbet) ve "image"
// (Cloudflare Workers AI / flux-1-schnell ile görsel üretimi — Gemini'nin
// görsel üretimi ücretsiz kademede kota vermediği için ayrı bir sağlayıcı
// kullanılıyor, bkz. api/_lib/cloudflareImage.js). İkisi TAMAMEN AYRI
// sohbetler olarak tutulur (bkz. sql/add_ai_chat_mode.sql -> mode sütunu,
// currentModeMessages()) — mod değiştirmek diğerinin geçmişini göstermez/
// etkilemez, "Geçmişi Temizle" de sadece o an açık olan modu siler.
// Üretilen görsel, doğrudan `data:image/...;base64,...` olarak content
// sütununa yazılır — yeni bir dosya depolama sistemi kurmaya gerek
// kalmasın diye; render sırasında content'in bu önekle başlayıp
// başlamadığına bakılarak metin mi görsel mi olduğu ayırt edilir.
// =====================================================================

import { getAiChatMessages, createAiChatMessage, clearAiChatMessages as apiClearAiChatMessages } from "./database.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll } from "./ui.js";
import { supabase } from "./supabase.js";

const IMAGE_PREFIX = "data:image/";

function isImageContent(content) {
  return typeof content === "string" && content.startsWith(IMAGE_PREFIX);
}

export function mapAiChatMessage(row) {
  return { id: row.id, role: row.role, content: row.content, mode: row.mode, createdAt: row.created_at };
}

/** O an açık olan moda (Metin/Görsel) ait mesajlar — ikisi ayrı sohbetler olarak tutulur (bkz. sql/add_ai_chat_mode.sql). */
function currentModeMessages() {
  return state.aiChatMessages.filter((m) => m.mode === state.aiChatMode);
}

function renderAiChat() {
  const list = document.getElementById("aiChatMessages");
  if (!list) return;
  const messages = currentModeMessages();
  const hasMessages = messages.length > 0;

  const textModeBtn = document.getElementById("aiChatModeText");
  const imageModeBtn = document.getElementById("aiChatModeImage");
  if (textModeBtn) textModeBtn.classList.toggle("active", state.aiChatMode !== "image");
  if (imageModeBtn) imageModeBtn.classList.toggle("active", state.aiChatMode === "image");

  if (!hasMessages && !state.aiChatSending) {
    list.innerHTML = `<div style="margin:auto; text-align:center; color:var(--text-muted);">
      <div style="font-size:40px; margin-bottom:10px;">✨🤖</div>
      <h3 style="font-family:var(--font-display); color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${t("aiChatEmptyTitle")}</h3>
      <p style="font-size:13px;">${t("aiChatEmptyDesc")}</p>
    </div>`;
    const input = document.getElementById("aiChatInput");
    if (input) input.placeholder = t(state.aiChatMode === "image" ? "aiChatInputPlaceholderImage" : "aiChatInputPlaceholder");
    const sendBtn = document.getElementById("aiChatSendBtn");
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  const avatar = (emoji, isUser) => `<div style="flex-shrink:0; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px;
    background:${isUser ? "var(--cyan-ink)" : "var(--bg-raised)"}; border:1px solid ${isUser ? "transparent" : "var(--line)"}; margin:${isUser ? "0 0 0 8px" : "0 8px 0 0"};">${emoji}</div>`;

  const bubbles = messages.map((m) => {
    const isUser = m.role === "user";
    const inner = isImageContent(m.content)
      ? `<img src="${escapeHtml(m.content)}" style="display:block; max-width:100%; border-radius:10px; margin-bottom:6px;">
         <div style="display:flex; gap:12px;">
           <a href="${escapeHtml(m.content)}" download="exc-gorsel-${m.id}.jpg" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--cyan-ink); text-decoration:none;">⬇️ ${t("aiChatDownloadImage")}</a>
           <a href="javascript:void(0)" onclick="useAiChatPrompt()" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--cyan-ink); text-decoration:none;">🔄 ${t("aiChatEditPrompt")}</a>
         </div>`
      : escapeHtml(m.content);
    return `<div style="display:flex; justify-content:${isUser ? "flex-end" : "flex-start"}; align-items:flex-end; margin-bottom:12px;">
      ${isUser ? "" : avatar("🤖", false)}
      <div style="max-width:72%; padding:10px 14px; border-radius:14px; white-space:pre-wrap; line-height:1.4; font-size:14px; box-shadow:0 1px 3px rgba(0,0,0,0.08);
        background:${isUser ? "var(--cyan-ink)" : "var(--bg-panel)"}; color:${isUser ? "#fff" : "var(--text-main)"};
        border:1px solid ${isUser ? "transparent" : "var(--line)"};">${inner}</div>
      ${isUser ? avatar("🧑", true) : ""}
    </div>`;
  }).join("");

  const pending = state.aiChatSending
    ? `<div style="display:flex; justify-content:flex-start; align-items:flex-end; margin-bottom:10px;">
         ${avatar("🤖", false)}
         <div style="padding:10px 14px; border-radius:14px; background:var(--bg-panel); border:1px solid var(--line); color:var(--text-dim); font-size:14px;">${t("aiChatThinking")}</div>
       </div>`
    : "";

  list.innerHTML = bubbles + pending;
  list.scrollTop = list.scrollHeight;

  const sendBtn = document.getElementById("aiChatSendBtn");
  if (sendBtn) sendBtn.disabled = state.aiChatSending;
  const input = document.getElementById("aiChatInput");
  if (input) {
    input.disabled = state.aiChatSending;
    input.placeholder = t(state.aiChatMode === "image" ? "aiChatInputPlaceholderImage" : "aiChatInputPlaceholder");
  }
}
registerRenderer(renderAiChat);

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session.access_token : "";
}

export function setAiChatMode(mode) {
  state.aiChatMode = mode === "image" ? "image" : "text";
  renderAll();
}

/**
 * Bir görsel mesajının altındaki "✏️ Yeniden Dene" — gerçek bir
 * piksel-düzenleme DEĞİL, sadece Görsel moduna geçip giriş kutusunu
 * BOŞ bırakarak odaklar; eski açıklamayı tekrar doldurmaz, admin kendi
 * yeni talimatını baştan yazar (bkz. kullanıcı geri bildirimi).
 */
export function useAiChatPrompt() {
  state.aiChatMode = "image";
  renderAll();
  const input = document.getElementById("aiChatInput");
  if (input) {
    input.value = "";
    input.focus();
  }
}

export async function sendAiChatMessage() {
  const input = document.getElementById("aiChatInput");
  const text = (input && input.value || "").trim();
  if (!text || state.aiChatSending) return;
  input.value = "";
  state.aiChatSending = true;
  renderAll();

  const isImageMode = state.aiChatMode === "image";
  try {
    const userRow = await createAiChatMessage("user", text, state.aiChatMode);
    state.aiChatMessages.push(mapAiChatMessage(userRow));
    renderAll();

    const token = await getAccessToken();
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(isImageMode
        ? { mode: "image", prompt: text }
        : { mode: "text", history: currentModeMessages().map((m) => ({ role: m.role, content: m.content })) })
    });
    const body = await res.json().catch(() => ({}));
    const replyContent = isImageMode ? body.image : body.reply;
    if (!res.ok || !replyContent) {
      console.error(body);
      showToast(body.error || "Error");
      return;
    }
    const assistantRow = await createAiChatMessage("assistant", replyContent, state.aiChatMode);
    state.aiChatMessages.push(mapAiChatMessage(assistantRow));
  } catch (error) {
    console.error(error);
    showToast("Error");
  } finally {
    state.aiChatSending = false;
    renderAll();
  }
}

/** Enter ile gönderir, Shift+Enter yeni satır bırakır. */
export function handleAiChatInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendAiChatMessage();
  }
}

export async function clearAiChatHistory() {
  if (!currentModeMessages().length) return;
  if (!confirm(t("confirmClearAiChat"))) return;
  try {
    await apiClearAiChatMessages(state.aiChatMode);
    state.aiChatMessages = state.aiChatMessages.filter((m) => m.mode !== state.aiChatMode);
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
