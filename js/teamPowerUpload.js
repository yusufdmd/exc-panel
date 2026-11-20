// =====================================================================
// EXC PANELİ — teamPowerUpload.js
// =====================================================================
// Üyeler sayfasındaki "📸 Takım Gücü Ekle" — Discord'daki
// /suggest-team-power komutuna ALTERNATİF, panelden BİZZAT bir üyenin
// "1. Ekip" ekran görüntüsünü yükleyip takım gücü/element önerisi
// oluşturmayı sağlar (bkz. sql/add_team_power_suggestions_viewer_insert.sql).
// Hem admin hem viewer (loncanın paylaşılan girişi) kullanabilir — oyuncu
// kendi adını roster'dan seçer (self-report-upload ile AYNI güven modeli,
// kullanıcı talebi), admin başkası için de kullanabilir. api/read-screenshot.js'teki
// "teamPower" tipi de aynı şekilde viewer'a açıktır.
//
// Kullanıcı talebiyle AYNI karardan: AI'nin okuduğu değer doğrudan üyeye
// YAZILMAZ, Discord'dan gelenle AYNI onay kuyruğuna (💪 Takım Gücü
// Önerileri, bkz. teamPowerSuggestions.js) düşer — admin yine de
// onaylar/düzeltir, iki yazma yolu birbirinden sapmaz.
//
// AI okuması api/read-screenshot.js üzerinden (type:"teamPower") yapılır —
// Discord akışındaki AYNI readTeamPower() paylaşılan fonksiyonu kullanılır.
//
// İki opsiyonel araştırma boss'u (Sky-Held Hawk/saldırı, Ophidillain/
// savunma) için AI okuması YOK (kullanıcı kararı) — sadece oyuncunun kendi
// beyanı (checkbox) kaydedilir, team_power/team_element ile AYNI tam-
// üzerine-yazma deseniyle members.has_hawk_boss/has_snake_boss'a yazılır
// (bkz. sql/add_team_boss_flags.sql, teamPowerSuggestions.js).
// =====================================================================

import { uploadSelfReportImage, createTeamPowerSuggestion } from "./database.js";
import { postReadScreenshot, resizeImageToDataUrl } from "./events.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll, elementLabel, elementBadge, ELEMENTS } from "./ui.js";
import { activeMembers } from "./members.js";
import { supabase } from "./supabase.js";

// claimedElement: admin biliyorsa kendi beyan ettiği element - AI'nin
// okuduğuyla (team_element) AYRI saklanır, uyuşmazlık varsa onay
// ekranında admin'e uyarı olarak gösterilir (bkz. teamPowerSuggestions.js).
const uploadState = { memberId: null, file: null, query: "", claimedElement: null, sending: false };

export function openTeamPowerUploadModal() {
  uploadState.memberId = null;
  uploadState.file = null;
  uploadState.query = "";
  uploadState.claimedElement = null;
  uploadState.sending = false;
  const fileInput = document.getElementById("teamPowerUploadFile");
  if (fileInput) fileInput.value = "";
  const searchInput = document.getElementById("teamPowerUploadMemberSearch");
  if (searchInput) searchInput.value = "";
  document.getElementById("teamPowerUploadHawkBoss").checked = false;
  document.getElementById("teamPowerUploadSnakeBoss").checked = false;
  document.getElementById("teamPowerUploadOverlay").classList.add("active");
  buildTeamPowerUploadElementPicker();
  renderTeamPowerUploadModal();
}

/** Element seçicide bir elemente tıklanınca çağrılır; zaten seçiliyse tekrar tıklamak seçimi kaldırır (opsiyonel alan). */
export function setTeamPowerUploadClaimedElement(element) {
  uploadState.claimedElement = uploadState.claimedElement === element ? null : element;
  renderTeamPowerUploadModal();
}

// KASITLI OLARAK bir renderer DEĞİL - sadece modal açılırken bir kez
// çağrılır (bkz. teamPowerSuggestions.js'teki AYNI notta açıklanan
// render-sırası hatası - her renderAll()'da yeniden kurulsaydı,
// renderTeamPowerUploadModal'ın uyguladığı "active" class'ı silerdi).
function buildTeamPowerUploadElementPicker() {
  const container = document.getElementById("teamPowerUploadElementPicker");
  if (!container) return;
  container.innerHTML = ELEMENTS.map((el) =>
    `<div class="element-opt" data-el="${el}" onclick="setTeamPowerUploadClaimedElement('${el}')" title="${elementLabel(el)}">${elementBadge(el, 32)}</div>`
  ).join("");
}

export function closeTeamPowerUploadModal() {
  document.getElementById("teamPowerUploadOverlay").classList.remove("active");
}

export function setTeamPowerUploadMemberQuery(query) {
  uploadState.query = query || "";
  renderTeamPowerUploadModal();
}

export function selectTeamPowerUploadMember(memberId) {
  uploadState.memberId = memberId;
  uploadState.query = "";
  const searchInput = document.getElementById("teamPowerUploadMemberSearch");
  if (searchInput) searchInput.value = "";
  renderTeamPowerUploadModal();
}

export function setTeamPowerUploadFile(input) {
  uploadState.file = (input.files && input.files[0]) || null;
  renderTeamPowerUploadModal();
}

function renderTeamPowerUploadModal() {
  const overlay = document.getElementById("teamPowerUploadOverlay");
  if (!overlay || !overlay.classList.contains("active")) return;

  const query = uploadState.query.trim().toLowerCase();
  const resultsEl = document.getElementById("teamPowerUploadMemberResults");
  if (resultsEl) {
    const matches = query ? activeMembers().filter((m) => (m.name || "").toLowerCase().includes(query)).slice(0, 20) : [];
    resultsEl.innerHTML = matches.map((m) =>
      `<div onclick="selectTeamPowerUploadMember('${m.id}')" style="padding:6px 10px; cursor:pointer; border-radius:6px; font-size:13px;" onmouseover="this.style.background='var(--bg-raised)'" onmouseout="this.style.background=''">${escapeHtml(m.name)}</div>`
    ).join("");
  }

  const selectedMember = uploadState.memberId ? state.members.find((m) => m.id === uploadState.memberId) : null;
  const selectedEl = document.getElementById("teamPowerUploadSelectedMember");
  if (selectedEl) {
    selectedEl.style.display = selectedMember ? "" : "none";
    selectedEl.textContent = selectedMember ? `✓ ${selectedMember.name}` : "";
  }

  document.querySelectorAll("#teamPowerUploadElementPicker .element-opt").forEach((el) => {
    el.classList.toggle("active", el.dataset.el === uploadState.claimedElement);
  });

  const submitBtn = document.getElementById("teamPowerUploadSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = !(uploadState.memberId && uploadState.file) || uploadState.sending;
    submitBtn.textContent = uploadState.sending ? t("aiFillWorking") : t("selfReportUploadSubmitBtn");
  }
}
registerRenderer(renderTeamPowerUploadModal);

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data && data.session ? data.session.access_token : "";
}

export async function submitTeamPowerUpload() {
  if (!uploadState.memberId || !uploadState.file || uploadState.sending) return;
  const member = state.members.find((m) => m.id === uploadState.memberId);
  if (!member) return;
  uploadState.sending = true;
  renderAll();

  try {
    const dataUrl = await resizeImageToDataUrl(uploadState.file);
    const token = await getAccessToken();
    // "teamPower" roster ALMAZ - Discord akışındaki AYNI readTeamPower(),
    // sadece tek görselden {teamPower, teamElement} okur (bkz. api/read-screenshot.js).
    const result = await postReadScreenshot({ type: "teamPower", images: [dataUrl] }, token);

    const imageUrl = await uploadSelfReportImage(uploadState.file);

    await createTeamPowerSuggestion({
      member_id: member.id,
      discord_id: null,
      team_power: result.teamPower,
      team_element: result.teamElement,
      claimed_element: uploadState.claimedElement,
      hawk_boss: document.getElementById("teamPowerUploadHawkBoss").checked,
      snake_boss: document.getElementById("teamPowerUploadSnakeBoss").checked,
      image_url: imageUrl,
      status: "pending"
    });

    closeTeamPowerUploadModal();
    showToast(t("toastSelfReportUploadSent"));
  } catch (error) {
    console.error(error);
    showToast(error && error.message ? error.message : "Error");
  } finally {
    uploadState.sending = false;
    renderAll();
  }
}
