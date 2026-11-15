// =====================================================================
// EXC PANELİ — selfReportUpload.js
// =====================================================================
// Etkinlikler sekmesindeki "📸 Katılımını Bildir" — Discord'daki
// /report-participation komutuna ALTERNATİF, panel üzerinden kendi
// kendine katılım bildirme (bkz. sql/add_self_report_site_upload.sql).
// Panelde giriş yapmış HERKES (admin + viewer, loncanın paylaşılan
// girişi) kullanabilir — oyuncu kendi Discord'u olmadan/komut
// kullanmadan da bildirebilsin diye. Oyuncu kendi adını roster'dan
// SEÇER (serbest metin değil) - gerçek bir kimlik doğrulaması değil,
// Discord akışındaki "AI roster'da eşleştirir" güven seviyesiyle AYNI;
// son söz yine admin onayı (bkz. selfReports.js).
//
// AI okuması api/read-screenshot.js üzerinden yapılır (admin'in toplu
// giriş ekranındaki "AI ile Doldur" ile PAYLAŞILAN aynı uç nokta —
// viewer rolü SADECE bu 3 etkinlik + tek kişilik roster ile çağırabilir,
// bkz. o dosyadaki yetki kısıtı). Oyuncu kendi ismini zaten seçtiği
// için AI'nin roster'da isim eşleştirmesi yapmasına hiç gerek yok,
// sadece değeri okur — Discord akışındaki "AI bu üyeyi bulamadı"
// hata sınıfı burada hiç oluşmaz.
// =====================================================================

import { uploadSelfReportImage, createSelfReportSubmission } from "./database.js";
import { postReadScreenshot } from "./events.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll } from "./ui.js";
import { activeMembers } from "./members.js";
import { supabase } from "./supabase.js";

// Discord'daki self-report kısıtının AYNISI (bkz. selfReports.js'teki
// SELF_REPORTABLE_TYPES) - elle senkron tutulan bir kopya, ikisi de
// tarayıcı tarafında aynı dilde ama ayrı modüller olduğu için.
const UPLOAD_TYPES = ["svs", "kod", "kodgvg"];

const uploadState = { eventType: "svs", memberId: null, file: null, query: "", sending: false };

export function openSelfReportUploadModal() {
  uploadState.eventType = "svs";
  uploadState.memberId = null;
  uploadState.file = null;
  uploadState.query = "";
  uploadState.sending = false;
  const fileInput = document.getElementById("selfReportUploadFile");
  if (fileInput) fileInput.value = "";
  const searchInput = document.getElementById("selfReportUploadMemberSearch");
  if (searchInput) searchInput.value = "";
  document.getElementById("selfReportUploadOverlay").classList.add("active");
  renderSelfReportUploadModal();
}

export function closeSelfReportUploadModal() {
  document.getElementById("selfReportUploadOverlay").classList.remove("active");
}

export function setSelfReportUploadType(type) {
  if (!UPLOAD_TYPES.includes(type)) return;
  uploadState.eventType = type;
  renderSelfReportUploadModal();
}

export function setSelfReportUploadMemberQuery(query) {
  uploadState.query = query || "";
  renderSelfReportUploadModal();
}

export function selectSelfReportUploadMember(memberId) {
  uploadState.memberId = memberId;
  uploadState.query = "";
  const searchInput = document.getElementById("selfReportUploadMemberSearch");
  if (searchInput) searchInput.value = "";
  renderSelfReportUploadModal();
}

export function setSelfReportUploadFile(input) {
  uploadState.file = (input.files && input.files[0]) || null;
  renderSelfReportUploadModal();
}

function renderSelfReportUploadModal() {
  const overlay = document.getElementById("selfReportUploadOverlay");
  if (!overlay || !overlay.classList.contains("active")) return;

  document.querySelectorAll("#selfReportUploadTypeButtons .subtab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === uploadState.eventType);
  });

  const query = uploadState.query.trim().toLowerCase();
  const resultsEl = document.getElementById("selfReportUploadMemberResults");
  if (resultsEl) {
    const matches = query ? activeMembers().filter((m) => (m.name || "").toLowerCase().includes(query)).slice(0, 20) : [];
    resultsEl.innerHTML = matches.map((m) =>
      `<div onclick="selectSelfReportUploadMember('${m.id}')" style="padding:6px 10px; cursor:pointer; border-radius:6px; font-size:13px;" onmouseover="this.style.background='var(--bg-raised)'" onmouseout="this.style.background=''">${escapeHtml(m.name)}</div>`
    ).join("");
  }

  const selectedMember = uploadState.memberId ? state.members.find((m) => m.id === uploadState.memberId) : null;
  const selectedEl = document.getElementById("selfReportUploadSelectedMember");
  if (selectedEl) {
    selectedEl.style.display = selectedMember ? "" : "none";
    selectedEl.textContent = selectedMember ? `✓ ${selectedMember.name}` : "";
  }

  const submitBtn = document.getElementById("selfReportUploadSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = !(uploadState.memberId && uploadState.file) || uploadState.sending;
    submitBtn.textContent = uploadState.sending ? t("aiFillWorking") : t("selfReportUploadSubmitBtn");
  }
}
registerRenderer(renderSelfReportUploadModal);

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session.access_token : "";
}

export async function submitSelfReportUpload() {
  if (!uploadState.memberId || !uploadState.file || uploadState.sending) return;
  const member = state.members.find((m) => m.id === uploadState.memberId);
  if (!member) return;
  uploadState.sending = true;
  renderAll();

  try {
    const dataUrl = await fileToDataUrl(uploadState.file);
    const token = await getAccessToken();
    // Oyuncu kendi ismini zaten seçti - roster TEK kişilik, AI sadece
    // değeri okur, isim eşleştirmesi yapmaz (bkz. api/read-screenshot.js).
    const roster = [{ id: member.id, name: member.name || "", gameId: member.gameId || "" }];
    const payload = await postReadScreenshot({ type: uploadState.eventType, roster, images: [dataUrl] }, token);
    const result = payload.results && payload.results[0];

    const imageUrl = await uploadSelfReportImage(uploadState.file);

    const store = state[uploadState.eventType];
    const sortedWeeks = store ? [...store.weeks].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [];
    const weekId = sortedWeeks.length ? sortedWeeks[0].id : null;

    await createSelfReportSubmission({
      member_id: member.id,
      discord_id: null,
      event_type: uploadState.eventType,
      week_id: weekId,
      image_url: imageUrl,
      ai_extracted: result ? { status: result.status, points: result.points, excused: result.excused } : null,
      ai_unmatched: !result,
      status: "pending"
    });

    closeSelfReportUploadModal();
    showToast(t("toastSelfReportUploadSent"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  } finally {
    uploadState.sending = false;
    renderAll();
  }
}
