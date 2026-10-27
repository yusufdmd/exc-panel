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
// =====================================================================

import { getAiChatMessages, createAiChatMessage, clearAiChatMessages as apiClearAiChatMessages } from "./database.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll } from "./ui.js";
import { supabase } from "./supabase.js";

export function mapAiChatMessage(row) {
  return { id: row.id, role: row.role, content: row.content, createdAt: row.created_at };
}

function renderAiChat() {
  const list = document.getElementById("aiChatMessages");
  if (!list) return;
  const hasMessages = state.aiChatMessages.length > 0;
  const emptyEl = document.getElementById("aiChatEmpty");
  if (emptyEl) emptyEl.style.display = hasMessages || state.aiChatSending ? "none" : "block";

  const bubbles = state.aiChatMessages.map((m) => {
    const isUser = m.role === "user";
    return `<div style="display:flex; justify-content:${isUser ? "flex-end" : "flex-start"}; margin-bottom:10px;">
      <div style="max-width:75%; padding:10px 14px; border-radius:14px; white-space:pre-wrap; line-height:1.4; font-size:14px;
        background:${isUser ? "var(--cyan-ink)" : "var(--bg-panel)"}; color:${isUser ? "#fff" : "var(--text-main)"};
        border:1px solid ${isUser ? "transparent" : "var(--line)"};">${escapeHtml(m.content)}</div>
    </div>`;
  }).join("");

  const pending = state.aiChatSending
    ? `<div style="display:flex; justify-content:flex-start; margin-bottom:10px;">
         <div style="padding:10px 14px; border-radius:14px; background:var(--bg-panel); border:1px solid var(--line); color:var(--text-dim); font-size:14px;">${t("aiChatThinking")}</div>
       </div>`
    : "";

  list.innerHTML = bubbles + pending;
  list.scrollTop = list.scrollHeight;

  const sendBtn = document.getElementById("aiChatSendBtn");
  if (sendBtn) sendBtn.disabled = state.aiChatSending;
  const input = document.getElementById("aiChatInput");
  if (input) input.disabled = state.aiChatSending;
}
registerRenderer(renderAiChat);

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session.access_token : "";
}

export async function sendAiChatMessage() {
  const input = document.getElementById("aiChatInput");
  const text = (input && input.value || "").trim();
  if (!text || state.aiChatSending) return;
  input.value = "";
  state.aiChatSending = true;
  renderAll();

  try {
    const userRow = await createAiChatMessage("user", text);
    state.aiChatMessages.push(mapAiChatMessage(userRow));
    renderAll();

    const token = await getAccessToken();
    const history = state.aiChatMessages.map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ history })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.reply) {
      console.error(body);
      showToast(body.error || "Error");
      return;
    }
    const assistantRow = await createAiChatMessage("assistant", body.reply);
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
  if (!state.aiChatMessages.length) return;
  if (!confirm(t("confirmClearAiChat"))) return;
  try {
    await apiClearAiChatMessages();
    state.aiChatMessages = [];
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
