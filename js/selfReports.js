// =====================================================================
// EXC PANELİ — selfReports.js
// =====================================================================
// Discord'daki "/report-participation" slash komutuyla oyuncuların kendi
// gönderdiği, bir AI'nin okuyup admin onayı bekleyen katılım kayıtları
// (bkz. sql/add_self_report_submissions.sql, api/discord-interactions.js).
// Onaylanan bir kayıt, admin panelindeki toplu girişle AYNI yazma
// fonksiyonunu (upsertRecord) ve AYNI app<->DB alan eşlemesini
// (entryToDbPayload, bkz. events.js) kullanarak ilgili {type}_records
// tablosuna işlenir — iki ayrı yazma yolu birbirinden sapmasın diye.
// =====================================================================

import { updateSelfReportSubmission, upsertRecord, logActivity } from "./database.js";
import { entryToDbPayload } from "./events.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll } from "./ui.js";

const EVENT_LABELS = { svs: "SVS", ss: "Sandstorm (SS)", kod: "King of Desert (KoD)", gvg: "GVG", kodgvg: "KoD-GVG" };

export function mapSelfReportSubmission(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    discordId: row.discord_id,
    eventType: row.event_type,
    weekId: row.week_id,
    imageUrl: row.image_url,
    aiExtracted: row.ai_extracted,
    aiUnmatched: !!row.ai_unmatched,
    status: row.status,
    createdAt: row.created_at
  };
}

/** AI'nin okuduğu veriyi admin için kısa, okunur bir özete çevirir. */
function summarizeExtracted(eventType, extracted) {
  if (!extracted) return "—";
  if (eventType === "gvg" || eventType === "kodgvg") return `${Number(extracted.points) || 0} puan`;
  if (eventType === "kod" || eventType === "svs") return extracted.status === "joined" ? "Katıldı" : "Katılmadı";
  if (eventType === "ss") return `${extracted.attended ? "Katıldı" : "Katılmadı"}${extracted.group ? ` (${escapeHtml(extracted.group)} grubu)` : ""}`;
  return "—";
}

function renderSelfReports() {
  const wrap = document.getElementById("selfReportsSection");
  if (!wrap) return;
  const hasItems = state.selfReportSubmissions.length > 0;
  document.getElementById("selfReportsEmpty").style.display = hasItems ? "none" : "block";
  document.getElementById("selfReportsTableWrap").style.display = hasItems ? "" : "none";
  document.getElementById("selfReportsRows").innerHTML = state.selfReportSubmissions.map((sub) => {
    const member = state.members.find((m) => m.id === sub.memberId);
    const memberName = member ? member.name : "—";
    return `
    <tr>
      <td><span class="member-name">${escapeHtml(memberName)}</span></td>
      <td>${escapeHtml(EVENT_LABELS[sub.eventType] || sub.eventType)}</td>
      <td>${sub.aiUnmatched ? `<span style="color:var(--danger-ink,#E5484D);">${t("selfReportUnmatched")}</span>` : escapeHtml(summarizeExtracted(sub.eventType, sub.aiExtracted))}</td>
      <td>${escapeHtml((sub.createdAt || "").slice(0, 16).replace("T", " "))}</td>
      <td><a href="${escapeHtml(sub.imageUrl)}" target="_blank" rel="noopener" title="${t("selfReportViewImage")}">🖼️</a></td>
      <td><div class="row-actions">
        ${sub.aiUnmatched ? "" : `<button class="icon-btn" onclick="approveSelfReportSubmission('${sub.id}')" title="${t("approveSelfReportTitle")}">✅</button>`}
        <button class="icon-btn danger" onclick="rejectSelfReportSubmission('${sub.id}')" title="${t("rejectSelfReportTitle")}">✕</button>
      </div></td>
    </tr>
  `;
  }).join("");
}

/** Bir bildirimi onaylar: AI'nin okuduğu veriyi ilgili {type}_records tablosuna işler, bildirimi "approved" işaretler. */
export async function approveSelfReportSubmission(id) {
  const sub = state.selfReportSubmissions.find((s) => s.id === id);
  if (!sub || sub.aiUnmatched || !sub.aiExtracted) return;
  if (!confirm(t("confirmApproveSelfReport"))) return;
  try {
    const entry = { ...sub.aiExtracted, weekId: sub.weekId };
    const payload = entryToDbPayload(sub.eventType, entry, sub.memberId);
    await upsertRecord(sub.eventType, payload);
    await updateSelfReportSubmission(id, { status: "approved", reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString() });
    state.selfReportSubmissions = state.selfReportSubmissions.filter((s) => s.id !== id);
    await logActivity("approved", "self_report", id, { eventType: sub.eventType, memberId: sub.memberId }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastSelfReportApproved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir bildirimi reddeder — hiçbir katılım kaydına dokunulmaz, sadece durumu "rejected" olur (hesap verebilirlik için silinmez). */
export async function rejectSelfReportSubmission(id) {
  if (!confirm(t("confirmRejectSelfReport"))) return;
  try {
    await updateSelfReportSubmission(id, { status: "rejected", reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString() });
    state.selfReportSubmissions = state.selfReportSubmissions.filter((s) => s.id !== id);
    renderAll();
    showToast(t("toastSelfReportRejected"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

registerRenderer(renderSelfReports);
