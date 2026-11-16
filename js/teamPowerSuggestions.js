// =====================================================================
// EXC PANELİ — teamPowerSuggestions.js
// =====================================================================
// Discord'daki "/suggest-team-power" slash komutuyla VEYA panelden
// (Üyeler sayfası -> "📸 Takım Gücü Ekle", bkz. js/teamPowerUpload.js)
// oluşan, bir AI'nin okuyup admin onayı bekleyen takım gücü + element
// önerileri (bkz. sql/add_team_power_suggestions.sql,
// sql/add_team_power_claimed_element.sql). Onaylanan bir öneri, panildeki
// "Üye Kaydet" akışıyla (members.js -> saveMember) AYNI iki adımı
// uygular: members.team_power/team_element'i günceller VE değer
// gerçekten değiştiyse team_power_history'ye yeni bir satır ekler — iki
// ayrı yazma yolu birbirinden sapmasın diye.
//
// "✅" doğrudan onaylamaz - selfReports.js'teki AYNI mantıkla bir
// inceleme/düzeltme ekranı açar: admin ekran görüntüsünü görür, AI'nin
// okuduğu puan/elementi isterse düzeltir, TEK "Onayla" butonuna basar.
// Oyuncu (Discord'da opsiyonel "element" seçeneğiyle) veya admin (site
// yüklemesinde) kendi beyan ettiği element AI'nin okuduğundan farklıysa,
// bu ekranda bir UYUŞMAZLIK UYARISI gösterilir (bkz. kullanıcı talebi).
// =====================================================================

import { updateTeamPowerSuggestion, updateMember, addTeamPowerHistoryEntry, logActivity } from "./database.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll, formatPower, elementLabel, elementBadge, todayStr, ELEMENTS } from "./ui.js";
import { mapMember } from "./members.js";

export function mapTeamPowerSuggestion(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    discordId: row.discord_id,
    teamPower: row.team_power,
    teamElement: row.team_element,
    claimedElement: row.claimed_element,
    imageUrl: row.image_url,
    status: row.status,
    createdAt: row.created_at
  };
}

// Admin'in onaydan ÖNCE düzeltebileceği taslak değerler - sadece bu
// tarayıcı sekmesinde yaşayan geçici bir anlık görüntü (bkz. selfReports.js'teki AYNI desen).
const teamPowerEdits = {};

function getTeamPowerEdit(sub) {
  if (!teamPowerEdits[sub.id]) {
    teamPowerEdits[sub.id] = { teamPower: Number(sub.teamPower) || 0, teamElement: sub.teamElement };
  }
  return teamPowerEdits[sub.id];
}

export function setTeamPowerEditField(id, field, value) {
  const sub = state.teamPowerSuggestions.find((s) => s.id === id);
  if (!sub) return;
  getTeamPowerEdit(sub)[field] = value;
  renderAll();
}

function renderTeamPowerSuggestions() {
  const wrap = document.getElementById("teamPowerSuggestionsSection");
  if (!wrap) return;
  const hasItems = state.teamPowerSuggestions.length > 0;
  document.getElementById("teamPowerSuggestionsEmpty").style.display = hasItems ? "none" : "block";
  document.getElementById("teamPowerSuggestionsTableWrap").style.display = hasItems ? "" : "none";
  document.getElementById("teamPowerSuggestionsRows").innerHTML = state.teamPowerSuggestions.map((sub) => {
    const member = state.members.find((m) => m.id === sub.memberId);
    const memberName = member ? member.name : "—";
    const edit = getTeamPowerEdit(sub);
    // edit.teamElement ile karşılaştırılır (sub.teamElement DEĞİL) - admin
    // modalda zaten düzelttiyse, satırdaki uyarı da buna göre kaybolmalı.
    const mismatchNote = sub.claimedElement && sub.claimedElement !== edit.teamElement
      ? `<div style="color:var(--warn-ink,#E8C34A); font-size:11px;">${t("teamPowerMismatchShort")}</div>`
      : "";
    return `
    <tr>
      <td><span class="member-name">${escapeHtml(memberName)}</span></td>
      <td>${elementBadge(edit.teamElement, 20)} ${escapeHtml(elementLabel(edit.teamElement))}</td>
      <td>${escapeHtml(formatPower(edit.teamPower))}${mismatchNote}</td>
      <td>${escapeHtml((sub.createdAt || "").slice(0, 16).replace("T", " "))}</td>
      <td><a href="${escapeHtml(sub.imageUrl)}" target="_blank" rel="noopener" title="${t("selfReportViewImage")}">🖼️</a></td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openTeamPowerReviewModal('${sub.id}')" title="${t("approveSelfReportTitle")}">✅</button>
        <button class="icon-btn danger" onclick="rejectTeamPowerSuggestion('${sub.id}')" title="${t("rejectSelfReportTitle")}">✕</button>
      </div></td>
    </tr>
  `;
  }).join("");
}

// =====================================================================
// ONAY/DÜZELTME EKRANI — bkz. dosya başındaki NOT, selfReports.js'teki
// AYNI desen (openSelfReportReviewModal).
// =====================================================================
let reviewingSuggestionId = null;

export function openTeamPowerReviewModal(id) {
  reviewingSuggestionId = id;
  document.getElementById("teamPowerReviewOverlay").classList.add("active");
  buildTeamPowerReviewElementPicker();
  renderTeamPowerReviewModal();
}

export function closeTeamPowerReviewModal() {
  reviewingSuggestionId = null;
  document.getElementById("teamPowerReviewOverlay").classList.remove("active");
}

/** Modal tek bir statik DOM parçası - element seçicinin onclick'i o an açık olan reviewingSuggestionId'yi burada okur. */
export function setReviewingTeamElement(element) {
  if (reviewingSuggestionId) setTeamPowerEditField(reviewingSuggestionId, "teamElement", element);
}

export function setReviewingTeamPower(value) {
  if (reviewingSuggestionId) setTeamPowerEditField(reviewingSuggestionId, "teamPower", Number(value) || 0);
}

function renderTeamPowerReviewModal() {
  const overlay = document.getElementById("teamPowerReviewOverlay");
  if (!overlay || !overlay.classList.contains("active") || !reviewingSuggestionId) return;
  const sub = state.teamPowerSuggestions.find((s) => s.id === reviewingSuggestionId);
  if (!sub) { closeTeamPowerReviewModal(); return; }

  const member = state.members.find((m) => m.id === sub.memberId);
  const edit = getTeamPowerEdit(sub);
  document.getElementById("teamPowerReviewMember").textContent = member ? member.name : "—";
  document.getElementById("teamPowerReviewImage").src = sub.imageUrl;
  document.getElementById("teamPowerReviewPoints").value = edit.teamPower;

  document.querySelectorAll("#teamPowerReviewElementPicker .element-opt").forEach((el) => {
    el.classList.toggle("active", el.dataset.el === edit.teamElement);
  });

  const mismatchEl = document.getElementById("teamPowerReviewMismatch");
  const hasMismatch = sub.claimedElement && sub.claimedElement !== edit.teamElement;
  mismatchEl.style.display = hasMismatch ? "block" : "none";
  if (hasMismatch) {
    mismatchEl.textContent = t("teamPowerMismatchWarning")
      .replace("{claimed}", elementLabel(sub.claimedElement))
      .replace("{ai}", elementLabel(sub.teamElement));
  }
}
registerRenderer(renderTeamPowerReviewModal);

// Element seçicide (modal içinde) butonları doldurur — bkz. ui.js ->
// buildElementPicker (AYNI desen, ayrı kopya). KASITLI OLARAK bir
// renderer DEĞİL (registerRenderer'a kaydedilmiyor) - sadece modal
// açılırken BİR KEZ çağrılır (bkz. openTeamPowerReviewModal). Her
// renderAll()'da yeniden kurulsaydı, renderTeamPowerReviewModal'ın
// hemen sonra uyguladığı "active" class'ı siler, element seçimi hiç
// görünmez hale gelirdi (canlı testte yakalandı).
function buildTeamPowerReviewElementPicker() {
  const container = document.getElementById("teamPowerReviewElementPicker");
  if (!container) return;
  container.innerHTML = ELEMENTS.map((el) =>
    `<div class="element-opt" data-el="${el}" onclick="setReviewingTeamElement('${el}')" title="${elementLabel(el)}">${elementBadge(el, 32)}</div>`
  ).join("");
}

/** Onay/düzeltme modalındaki TEK "Onayla" butonu - o an açık olan öneriyi onaylar. */
export function approveReviewingTeamPowerSuggestion() {
  if (reviewingSuggestionId) approveTeamPowerSuggestion(reviewingSuggestionId);
}

/** Bir öneriyi onaylar: members.team_power/team_element'i günceller, değiştiyse team_power_history'ye yeni satır ekler. */
export async function approveTeamPowerSuggestion(id) {
  const sub = state.teamPowerSuggestions.find((s) => s.id === id);
  if (!sub) return;
  const member = state.members.find((m) => m.id === sub.memberId);
  if (!member) return;
  // Artık sub.teamPower/teamElement'ı DEĞİL, admin'in düzenleme ekranında
  // o an gördüğü (gerekirse düzelttiği) değerleri kullanıyoruz.
  const edit = getTeamPowerEdit(sub);
  if (!confirm(t("confirmApproveSelfReport"))) return;
  try {
    const row = await updateMember(member.id, { team_power: edit.teamPower, team_element: edit.teamElement });
    const index = state.members.findIndex((m) => m.id === member.id);
    const teamPowerHistory = Array.isArray(member.teamPowerHistory) ? [...member.teamPowerHistory] : [];
    const lastEntry = teamPowerHistory[teamPowerHistory.length - 1];
    if (!lastEntry || Number(lastEntry.teamPower) !== edit.teamPower) {
      const today = todayStr();
      teamPowerHistory.push({ date: today, teamPower: edit.teamPower });
      await addTeamPowerHistoryEntry(member.id, today, edit.teamPower);
    }
    if (index >= 0) state.members[index] = { ...mapMember(row), discordId: member.discordId, powerHistory: member.powerHistory, teamPowerHistory };

    await updateTeamPowerSuggestion(id, {
      status: "approved", team_power: edit.teamPower, team_element: edit.teamElement,
      reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString()
    });
    state.teamPowerSuggestions = state.teamPowerSuggestions.filter((s) => s.id !== id);
    delete teamPowerEdits[id];
    if (reviewingSuggestionId === id) closeTeamPowerReviewModal();
    await logActivity("approved", "team_power_suggestion", id, { name: `${member.name || "İsimsiz"} — ${formatPower(edit.teamPower)} (${elementLabel(edit.teamElement)})` }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastSelfReportApproved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir öneriyi reddeder — hiçbir üye verisine dokunulmaz, sadece durumu "rejected" olur (hesap verebilirlik için silinmez). */
export async function rejectTeamPowerSuggestion(id) {
  const sub = state.teamPowerSuggestions.find((s) => s.id === id);
  if (!confirm(t("confirmRejectSelfReport"))) return;
  try {
    const member = sub ? state.members.find((m) => m.id === sub.memberId) : null;
    await updateTeamPowerSuggestion(id, { status: "rejected", reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString() });
    state.teamPowerSuggestions = state.teamPowerSuggestions.filter((s) => s.id !== id);
    delete teamPowerEdits[id];
    if (reviewingSuggestionId === id) closeTeamPowerReviewModal();
    if (sub) {
      const edit = getTeamPowerEdit(sub);
      await logActivity("rejected", "team_power_suggestion", id, { name: `${member ? member.name : "—"} — ${formatPower(edit.teamPower)} (${elementLabel(edit.teamElement)})` }, state.currentAdminUsername);
    }
    renderAll();
    showToast(t("toastSelfReportRejected"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

registerRenderer(renderTeamPowerSuggestions);
