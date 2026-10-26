// =====================================================================
// EXC PANELİ — teamPowerSuggestions.js
// =====================================================================
// Discord'daki "/suggest-team-power" slash komutuyla oyuncuların kendi
// "1. Ekip" ekran görüntüsünü yüklemesiyle oluşan, bir AI'nin okuyup admin
// onayı bekleyen takım gücü + element önerileri (bkz.
// sql/add_team_power_suggestions.sql, api/discord-interactions.js).
// Onaylanan bir öneri, panildeki "Üye Kaydet" akışıyla (members.js ->
// saveMember) AYNI iki adımı uygular: members.team_power/team_element'i
// günceller VE değer gerçekten değiştiyse team_power_history'ye yeni bir
// satır ekler — iki ayrı yazma yolu birbirinden sapmasın diye.
// =====================================================================

import { updateTeamPowerSuggestion, updateMember, addTeamPowerHistoryEntry, logActivity } from "./database.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll, formatPower, elementLabel, elementBadge, todayStr } from "./ui.js";
import { mapMember } from "./members.js";

export function mapTeamPowerSuggestion(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    discordId: row.discord_id,
    teamPower: row.team_power,
    teamElement: row.team_element,
    imageUrl: row.image_url,
    status: row.status,
    createdAt: row.created_at
  };
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
    return `
    <tr>
      <td><span class="member-name">${escapeHtml(memberName)}</span></td>
      <td>${elementBadge(sub.teamElement, 20)} ${escapeHtml(elementLabel(sub.teamElement))}</td>
      <td>${escapeHtml(formatPower(sub.teamPower))}</td>
      <td>${escapeHtml((sub.createdAt || "").slice(0, 16).replace("T", " "))}</td>
      <td><a href="${escapeHtml(sub.imageUrl)}" target="_blank" rel="noopener" title="${t("selfReportViewImage")}">🖼️</a></td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="approveTeamPowerSuggestion('${sub.id}')" title="${t("approveSelfReportTitle")}">✅</button>
        <button class="icon-btn danger" onclick="rejectTeamPowerSuggestion('${sub.id}')" title="${t("rejectSelfReportTitle")}">✕</button>
      </div></td>
    </tr>
  `;
  }).join("");
}

/** Bir öneriyi onaylar: members.team_power/team_element'i günceller, değiştiyse team_power_history'ye yeni satır ekler. */
export async function approveTeamPowerSuggestion(id) {
  const sub = state.teamPowerSuggestions.find((s) => s.id === id);
  if (!sub) return;
  const member = state.members.find((m) => m.id === sub.memberId);
  if (!member) return;
  if (!confirm(t("confirmApproveSelfReport"))) return;
  try {
    const row = await updateMember(member.id, { team_power: sub.teamPower, team_element: sub.teamElement });
    const index = state.members.findIndex((m) => m.id === member.id);
    const teamPowerHistory = Array.isArray(member.teamPowerHistory) ? [...member.teamPowerHistory] : [];
    const lastEntry = teamPowerHistory[teamPowerHistory.length - 1];
    if (!lastEntry || Number(lastEntry.teamPower) !== sub.teamPower) {
      const today = todayStr();
      teamPowerHistory.push({ date: today, teamPower: sub.teamPower });
      await addTeamPowerHistoryEntry(member.id, today, sub.teamPower);
    }
    if (index >= 0) state.members[index] = { ...mapMember(row), discordId: member.discordId, powerHistory: member.powerHistory, teamPowerHistory };

    await updateTeamPowerSuggestion(id, { status: "approved", reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString() });
    state.teamPowerSuggestions = state.teamPowerSuggestions.filter((s) => s.id !== id);
    await logActivity("updated", "member", member.id, { name: member.name || "İsimsiz" }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastSelfReportApproved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir öneriyi reddeder — hiçbir üye verisine dokunulmaz, sadece durumu "rejected" olur (hesap verebilirlik için silinmez). */
export async function rejectTeamPowerSuggestion(id) {
  if (!confirm(t("confirmRejectSelfReport"))) return;
  try {
    await updateTeamPowerSuggestion(id, { status: "rejected", reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString() });
    state.teamPowerSuggestions = state.teamPowerSuggestions.filter((s) => s.id !== id);
    renderAll();
    showToast(t("toastSelfReportRejected"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

registerRenderer(renderTeamPowerSuggestions);
