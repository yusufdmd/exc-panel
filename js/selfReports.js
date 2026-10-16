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
import { entryToDbPayload, mapEntry } from "./events.js";
import { state, t, escapeHtml, showToast, registerRenderer, renderAll, isExempt } from "./ui.js";

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

/** AI'nin okuduğu veriyi admin için kısa, okunur bir özete çevirir — mevcut etkinlik tablolarındaki AYNI çeviri anahtarlarını kullanır. */
function summarizeExtracted(eventType, extracted) {
  if (!extracted) return "—";
  if (eventType === "gvg" || eventType === "kodgvg") return `${Number(extracted.points) || 0} ${t("thPointsCol")}`;
  if (eventType === "kod" || eventType === "svs") return extracted.status === "joined" ? t("legendJoined") : t("legendNotJoined");
  if (eventType === "ss") {
    const groupLabel = extracted.group === "A" ? t("groupA") : extracted.group === "B" ? t("groupB") : "";
    return `${extracted.attended ? t("legendJoined") : t("legendNotJoined")}${groupLabel ? ` (${groupLabel})` : ""}`;
  }
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
    const weekStore = state[sub.eventType];
    // En güncel hafta en üstte seçili gelir - bilerek sub.weekId (gönderim anındaki
    // "o anki en güncel hafta") değil, HER RENDER'DA yeniden hesaplanan gerçek en
    // güncel hafta: admin bir bildirimi onaylamadan önce yeni bir hafta eklerse,
    // açılır liste otomatik olarak o yeni haftayı varsayılan gösterir (istendiği gibi
    // "ekran görüntüleri biriksin, hafta eklenince oraya gitsin").
    const sortedWeeks = weekStore ? [...weekStore.weeks].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [];
    const weekSelect = sortedWeeks.length
      ? `<select id="selfReportWeek_${sub.id}" style="font-size:12px; padding:2px 4px;">${sortedWeeks.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.date || "—")}</option>`).join("")}</select>`
      : `<span style="color:var(--danger-ink,#E5484D);">(${t("selfReportNoWeek")})</span>`;
    return `
    <tr>
      <td><span class="member-name">${escapeHtml(memberName)}</span></td>
      <td>${escapeHtml(EVENT_LABELS[sub.eventType] || sub.eventType)} ${weekSelect}</td>
      <td>${sub.aiUnmatched ? `<span style="color:var(--danger-ink,#E5484D);">${t("selfReportUnmatched")}</span>` : escapeHtml(summarizeExtracted(sub.eventType, sub.aiExtracted))}</td>
      <td>${escapeHtml((sub.createdAt || "").slice(0, 16).replace("T", " "))}</td>
      <td><a href="${escapeHtml(sub.imageUrl)}" target="_blank" rel="noopener" title="${t("selfReportViewImage")}">🖼️</a></td>
      <td><div class="row-actions">
        ${sub.aiUnmatched || !sortedWeeks.length ? "" : `<button class="icon-btn" onclick="approveSelfReportSubmission('${sub.id}')" title="${t("approveSelfReportTitle")}">✅</button>`}
        <button class="icon-btn danger" onclick="rejectSelfReportSubmission('${sub.id}')" title="${t("rejectSelfReportTitle")}">✕</button>
      </div></td>
    </tr>
  `;
  }).join("");
}

/**
 * Bir bildirimi onaylar: AI'nin okuduğu veriyi ilgili {type}_records tablosuna
 * işler, bildirimi "approved" işaretler. Onaydan ÖNCE o (hafta, üye) için
 * NE vardıysa (hiç kayıt yoksa null) aktivite logunun details.snapshot'ına
 * yazılır — "Aktivite" sekmesindeki ↺ ile bu TEK yazma geri alınabilsin diye
 * (bkz. activity.js -> restoreSelfReportApproval).
 */
export async function approveSelfReportSubmission(id) {
  const sub = state.selfReportSubmissions.find((s) => s.id === id);
  if (!sub || sub.aiUnmatched || !sub.aiExtracted) return;
  // Hangi haftaya yazılacağı, gönderim anında kaydedilen sub.weekId değil,
  // admin'in o an panelde gördüğü açılır listeden SEÇTİĞİ hafta (bkz.
  // renderSelfReports - varsayılan olarak en güncel hafta seçili gelir).
  const weekSelect = document.getElementById(`selfReportWeek_${id}`);
  const weekId = weekSelect ? weekSelect.value : null;
  if (!weekId) return;
  if (!confirm(t("confirmApproveSelfReport"))) return;
  try {
    const store = state[sub.eventType];
    const previousEntry = store ? store.entries.find((e) => e.weekId === weekId && e.memberId === sub.memberId) || null : null;
    const week = store ? store.weeks.find((w) => w.id === weekId) : null;
    const member = state.members.find((m) => m.id === sub.memberId);

    const entry = { ...sub.aiExtracted, weekId };
    const payload = entryToDbPayload(sub.eventType, entry, sub.memberId);
    const row = await upsertRecord(sub.eventType, payload);
    const mapped = mapEntry(sub.eventType, row);
    const index = store.entries.findIndex((e) => e.weekId === weekId && e.memberId === sub.memberId);
    if (index >= 0) store.entries[index] = mapped; else store.entries.push(mapped);

    await updateSelfReportSubmission(id, { status: "approved", week_id: weekId, reviewed_by: state.currentAdminUsername || null, reviewed_at: new Date().toISOString() });
    state.selfReportSubmissions = state.selfReportSubmissions.filter((s) => s.id !== id);
    await logActivity("approved", "self_report", id, {
      name: `${member ? member.name : "—"} — ${EVENT_LABELS[sub.eventType] || sub.eventType}${week ? ` (${week.date})` : ""}`,
      snapshot: { type: sub.eventType, weekId, memberId: sub.memberId, submissionId: sub.id, previousEntry }
    }, state.currentAdminUsername);
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

/**
 * Bir etkinlik türü için "bu haftanın en güncel haftasında" ne elle bir
 * kaydı NE DE bekleyen/onaylanmış bir self-report'u olan TÜM aktif üyeleri
 * bulur (Discord'u bağlı olsun olmasın — bağlı olmayanlar Discord'dan kendi
 * bildiremez ama yine de "eksik" sayılırlar, sadece elle girilmeleri gerekir).
 * Tamamen tarayıcıda, zaten yüklü state'ten hesaplanır — sunucu tarafındaki
 * BENZER (ama sadece Discord'u bağlı olanları tarayan, çünkü DM atmak için
 * Discord ID şart) tanım için bkz. api/_lib/selfReportGaps.js - ikisi ayrı
 * dilde olduğu için elle senkron tutulan birer kopya, bkz.
 * engagementScoring.js'teki NOT.
 */
// SVS/KoD/Diğer'de bir hafta açıldığında her üyeye status="unknown" ile
// GERÇEK bir veritabanı satırı oluşuyor (bkz. events.js -> renderEntryRows,
// "statusUnknown" seçeneği) - bu "veri girilmedi" demek, "satır var" demek
// değil. GVG/KoD-GVG/SS'de böyle bir sentinel yok (varsayılan 0 puan/
// katılmadı, gerçek "0"dan ayırt edilemiyor), o yüzden onlarda herhangi bir
// satırın varlığı "veri girilmiş" sayılmaya devam ediyor - bilinen bir sınır.
function hasRealData(type, entry) {
  if (type === "svs" || type === "kod" || type === "other") return entry.status && entry.status !== "unknown";
  return true;
}

function computeMissingForType(type) {
  const store = state[type];
  if (!store || !store.weeks.length) return { week: null, missing: [] };
  const week = [...store.weeks].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const coveredMemberIds = new Set([
    ...store.entries.filter((e) => e.weekId === week.id && hasRealData(type, e)).map((e) => e.memberId),
    ...state.selfReportSubmissions.filter((s) => s.eventType === type && s.weekId === week.id).map((s) => s.memberId)
  ]);
  const missing = state.members
    .filter((m) => !m.isOld && !m.isMigrated)
    .filter((m) => !isExempt(m, week)) // haftadan önce katılmış/hesabı devralmışsa bu haftadan muaf (bkz. ui.js -> isExempt, engagement.js'teki AYNI kural)
    .filter((m) => !coveredMemberIds.has(m.id))
    .map((m) => ({ name: m.name, hasDiscord: !!m.discordId }));
  return { week, missing };
}

function renderSelfReportGaps() {
  const wrap = document.getElementById("selfReportGapsRows");
  if (!wrap) return;
  const rows = Object.keys(EVENT_LABELS).map((type) => {
    const { week, missing } = computeMissingForType(type);
    return { type, week, missing };
  }).filter((r) => r.week);
  wrap.innerHTML = rows.map((r) => `
    <tr>
      <td style="white-space:nowrap; vertical-align:top;">${escapeHtml(EVENT_LABELS[r.type])}</td>
      <td style="white-space:nowrap; vertical-align:top;">${escapeHtml(r.week.date || "—")}</td>
      <td>${r.missing.length
        ? `<div style="margin-bottom:4px; font-weight:600; color:var(--danger-ink,#E5484D);">${r.missing.length} ${t("selfReportGapCount")}</div>
           <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:900px;">${r.missing.map((m) => `<span class="cell-pill pill-red" title="${m.hasDiscord ? "" : t("selfReportGapNoDiscord")}">${escapeHtml(m.name)}${m.hasDiscord ? "" : " 🔗"}</span>`).join("")}</div>`
        : `<span style="color:var(--text-muted);">${t("selfReportGapsNone")}</span>`}</td>
    </tr>
  `).join("");
}

registerRenderer(renderSelfReports);
registerRenderer(renderSelfReportGaps);
