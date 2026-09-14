// =====================================================================
// EXC PANELİ — activity.js
// =====================================================================
// "Aktivite" sekmesi: hangi admin, ne zaman, hangi üyeyi/etkinlik
// haftasını/toplu girişini ekledi/düzenledi/sildi/geri aldı — basit bir
// "dijital parmak izi" listesi. Kayıtların kendisi düzenlenemez/silinemez
// (bkz. veritabanındaki activity_logs politikaları — kasıtlı olarak
// update/delete yok), ama "silindi" satırları için mümkünse bir "↺ Geri
// Yükle" aksiyonu sunulur:
//   - Bir üye silindiğinde (members.js -> deleteMember) veya bir hafta
//     silindiğinde (events.js -> deleteWeek) o anki TÜM verinin (üye
//     alanları + güç geçmişi + o haftaya/üyeye ait etkinlik kayıtları)
//     bir anlık görüntüsü `details.snapshot`'a kalıcı olarak yazılır.
//   - Bu dosyadaki restoreDeletedMember/restoreDeletedWeek, o anlık
//     görüntüyü ORİJİNAL id'lerle yeniden veritabanına yazar — böylece
//     yanlışlıkla silinen bir üye/hafta (ve altındaki kayıtlar) buradan
//     geri getirilebilir.
//   - Toplu giriş kaydı (saveEntry) YIKICI değildir (eski değerlerin
//     üzerine yazar ama satırı silmez), bu yüzden onun için bir "geri
//     yükleme" aksiyonu yoktur — sadece kim/ne zaman girdi bilgisi tutulur.
// =====================================================================

import { createMember, createWeek, upsertRecordsBulk, addPowerHistoryEntry, addTeamPowerHistoryEntry, createMigrationProspect, createMigrationLead, createNews, createFeaturedVideo, logActivity } from "./database.js";
import { state, t, showToast, escapeHtml, renderAll, registerRenderer, formatPower, elementLabel, migrationColorLabel, migrationStatusLabel } from "./ui.js";
import { mapMember } from "./members.js";
import { mapWeek, mapEntry, storeFor, entryToDbPayload, eventTypeLabel } from "./events.js";
import { mapProspect, mapLead } from "./migration.js";
import { mapNewsItem } from "./news.js";
import { mapVideoItem } from "./videos.js";

/** Supabase'ten dönen ham aktivite satırını uygulamanın kullandığı şekle çevirir. */
export function mapActivity(row) {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityName: (row.details && row.details.name) || null,
    details: row.details || {},
    createdAt: row.created_at
  };
}

const ACTION_LABEL_KEY = { created: "actionCreated", updated: "actionUpdated", deleted: "actionDeleted", restored: "actionRestored" };
const ACTION_CLASS = { created: "pill-green", updated: "pill-blue", deleted: "pill-red", restored: "pill-yellow" };

const SIMPLE_ENTITY_LABEL_KEY = { member: "lbMember", migration_prospect: "tabMigration", migration_lead: "migrationLeadLabel", news: "tabNews", featured_video: "tabVideos" };

/** Aktivite tablosundaki "Tür" sütunu için, entity_type değerini kısa okunur bir etikete çevirir. */
function entityTypeLabel(entityType) {
  if (!entityType) return "—";
  if (SIMPLE_ENTITY_LABEL_KEY[entityType]) return t(SIMPLE_ENTITY_LABEL_KEY[entityType]);
  const match = /^(gvg|svs|ss|kod|other)_(week|entries)$/.exec(entityType);
  if (!match) return entityType;
  const [, type, kind] = match;
  return kind === "week" ? `${eventTypeLabel(type)} ${t("thWeeks")}` : `${eventTypeLabel(type)} ${t("entryKindLabel")}`;
}

/** Basit (ilişkili alt-veri taşımayan) silinebilir kayıt türleri için ORTAK geri yükleme — göç adayı/haber/video. */
const SIMPLE_RESTORE = {
  migration_prospect: { create: createMigrationProspect, map: mapProspect, list: "migration" },
  migration_lead: { create: createMigrationLead, map: mapLead, list: "migrationLeads" },
  news: { create: createNews, map: mapNewsItem, list: "news" },
  featured_video: { create: createFeaturedVideo, map: mapVideoItem, list: "featuredVideos" }
};

export function renderActivity() {
  const rowsEl = document.getElementById("activityRows");
  if (!rowsEl) return;
  const list = state.activityLog;
  document.getElementById("activityEmpty").style.display = list.length ? "none" : "block";
  rowsEl.innerHTML = list.map((entry) => {
    const hasSnapshot = entry.action === "deleted" && entry.details && entry.details.snapshot;
    const isMember = entry.entityType === "member";
    const isWeek = /_week$/.test(entry.entityType || "");
    const isSimple = !!SIMPLE_RESTORE[entry.entityType];
    const canRestore = hasSnapshot && (isMember || isWeek || isSimple);
    const restoreFn = isMember ? "restoreDeletedMember" : isWeek ? "restoreDeletedWeek" : "restoreDeletedSimple";
    const restoreArgs = isSimple ? `('${entry.id}','${entry.entityType}')` : `('${entry.id}')`;
    const restoreBtn = canRestore
      ? `<button class="icon-btn admin-only" onclick="${restoreFn}${restoreArgs}" title="${t("restoreActionTitle")}">↺</button>`
      : "";
    // Bu tablonun verisi (state.activityLog) zaten SADECE admin oturumunda
    // çekiliyor (bkz. app.js -> loadAll, "restricted" kontrolü) — üye
    // (viewer) hesabında bu dizi hep boş kalır, o yüzden burada ayrıca bir
    // admin-only sarmalayıcıya gerek yok.
    const nameCell = hasSnapshot
      ? `<span style="cursor:pointer; text-decoration:underline dotted; color:var(--cyan-ink);" onclick="showActivityDetails('${entry.id}')" title="${t("activityDetailsTitle")}">${escapeHtml(entry.entityName || "—")}</span>`
      : escapeHtml(entry.entityName || "—");
    return `<tr>
      <td>${escapeHtml((entry.createdAt || "").replace("T", " ").slice(0, 16))}</td>
      <td>${escapeHtml(entry.actor || "—")}</td>
      <td><span class="cell-pill ${ACTION_CLASS[entry.action] || "pill-gray"}">${t(ACTION_LABEL_KEY[entry.action] || "actionUpdated")}</span></td>
      <td>${escapeHtml(entityTypeLabel(entry.entityType))}</td>
      <td>${nameCell}</td>
      <td>${restoreBtn}</td>
    </tr>`;
  }).join("");
}
registerRenderer(renderActivity);

// =====================================================================
// "Detaylar" modalı — bir "silindi" satırındaki isme tıklayınca, o anki
// anlık görüntünün (snapshot) okunur bir dökümünü gösterir. Sadece
// GÖRÜNTÜLEME amaçlıdır, buradan hiçbir düzenleme yapılmaz — asıl geri
// getirme işlemi hâlâ aynı restoreDeleted* fonksiyonlarıyla olur (bu
// modalın içinde de aynı "↺ Geri Yükle" butonu tekrar sunulur).
// =====================================================================

/** [[etiket, değer], ...] çiftlerinden, boş/null olanları atlayan okunur bir tablo üretir. */
function renderDetailTable(rows) {
  const filtered = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!filtered.length) return `<p style="color:var(--text-dim); font-size:13px;">—</p>`;
  return `<table class="part-table"><tbody>${filtered.map(([label, value]) =>
    `<tr><td style="color:var(--text-dim); white-space:nowrap;">${escapeHtml(String(label))}</td><td>${escapeHtml(String(value))}</td></tr>`
  ).join("")}</tbody></table>`;
}

/** Bir etkinlik haftası kaydını (tür + entry) kısa, okunur bir metne çevirir. */
function formatWeekEntryValue(type, entry) {
  if (type === "gvg") return String(Number(entry.points) || 0);
  if (type === "kod") return `${entry.status === "joined" ? "✓" : "✕"}${entry.excused ? " (M)" : ""}`;
  if (type === "svs" || type === "other") return `${entry.status === "joined" ? "✓" : "✕"}${entry.excused ? " (M)" : ""} · ${Number(entry.points) || 0}p`;
  if (type === "ss") {
    const slots = [entry.appliedSlot1 && "1", entry.appliedSlot2 && "2", entry.appliedSlot3 && "3"].filter(Boolean).join(",");
    return `${entry.group || "—"} ${entry.attended ? "✓" : "✕"}${entry.excused ? " (M)" : ""}${slots ? ` [${t("thAppliedSlots")}: ${slots}]` : ""}`;
  }
  return "—";
}

const PROSPECT_DETAIL_FIELDS = [
  ["name", "lblUsername"], ["game_id", "lblGameId"], ["power", "powerTotalLabel", "power"], ["server", "lblServer"],
  ["color", "lblColor", "migrationColor"], ["status", "thStatus", "migrationStatus"], ["camp_level", "lblCamp"],
  ["team_power", "lblTeamPower", "power"], ["team_element", "lblTeamElement", "element"],
  ["note", "lblProspectNote"], ["invited_by", "lblInvitedBy"], ["score", "lblProspectScore"]
];
const LEAD_DETAIL_FIELDS = [
  ["name", "lblUsername"], ["game_id", "lblGameId"], ["contact", "thLeadContact"], ["current_server", "lblServer"],
  ["power", "powerTotalLabel", "power"], ["camp_level", "lblCamp"], ["team_power", "lblTeamPower", "power"],
  ["team_element", "lblTeamElement", "element"], ["message", "thLeadMessage"]
];
const NEWS_DETAIL_FIELDS = [["title", "lblNewsTitle"], ["body", "lblNewsBody"], ["published_at", "lblNewsDate"]];
const VIDEO_DETAIL_FIELDS = [["title", "lblVideoTitle"], ["url", "lblVideoUrl"]];

/** field tanımındaki 3. öğeye (varsa) göre ham değeri okunur hâle getirir. */
function formatDetailValue(kind, raw) {
  if (raw == null || raw === "") return raw;
  if (kind === "power") return formatPower(raw);
  if (kind === "element") return elementLabel(raw);
  if (kind === "migrationColor") return migrationColorLabel(raw);
  if (kind === "migrationStatus") return migrationStatusLabel(raw);
  return raw;
}

function renderFieldMapDetails(snapshot, fields) {
  return renderDetailTable(fields.map(([key, labelKey, kind]) => [t(labelKey), formatDetailValue(kind, snapshot[key])]));
}

/** Bir aktivite kaydının anlık görüntüsünü, türüne göre okunur bir HTML dökümüne çevirir. */
function snapshotDetailHtml(entry) {
  const snapshot = entry.details && entry.details.snapshot;
  if (!snapshot) return `<p style="color:var(--text-dim); font-size:13px;">${t("snapshotNoData")}</p>`;

  if (entry.entityType === "member") {
    const m = snapshot.member || {};
    const mainRows = [
      [t("lblUsername"), m.name], [t("lblGameId"), m.game_id], [t("lblRank"), m.rank], [t("lblCamp"), m.camp_level],
      [t("lblPower"), formatDetailValue("power", m.power)], [t("lblTeamPower"), formatDetailValue("power", m.team_power)],
      [t("lblTeamElement"), formatDetailValue("element", m.team_element)], [t("lblJoinedAt"), m.joined_at]
    ];
    const counts = [
      [t("snapshotPowerHistory"), (snapshot.powerHistory || []).length],
      [t("snapshotTeamPowerHistory"), (snapshot.teamPowerHistory || []).length],
      ...["gvg", "svs", "ss", "kod", "other"].map((type) => [eventTypeLabel(type), ((snapshot.entries && snapshot.entries[type]) || []).length])
    ];
    return renderDetailTable(mainRows)
      + `<h3 style="font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-dim); margin:14px 0 8px;">${t("snapshotEntryCounts")}</h3>`
      + renderDetailTable(counts);
  }

  const weekMatch = /^(gvg|svs|ss|kod|other)_week$/.exec(entry.entityType || "");
  if (weekMatch) {
    const type = weekMatch[1];
    const week = snapshot.week || {};
    const entries = snapshot.entries || [];
    const rows = entries.map((e) => {
      const member = state.members.find((mm) => mm.id === e.memberId);
      return [member ? member.name : e.memberId, formatWeekEntryValue(type, e)];
    });
    return `<p style="color:var(--text-muted); font-size:13px; margin-bottom:10px;">${escapeHtml(week.label || "")}${week.date ? " · " + escapeHtml(week.date) : ""}</p>`
      + renderDetailTable(rows);
  }

  if (entry.entityType === "migration_prospect") return renderFieldMapDetails(snapshot, PROSPECT_DETAIL_FIELDS);
  if (entry.entityType === "migration_lead") return renderFieldMapDetails(snapshot, LEAD_DETAIL_FIELDS);
  if (entry.entityType === "news") return renderFieldMapDetails(snapshot, NEWS_DETAIL_FIELDS);
  if (entry.entityType === "featured_video") return renderFieldMapDetails(snapshot, VIDEO_DETAIL_FIELDS);

  return `<pre style="white-space:pre-wrap; font-size:12px; color:var(--text-muted);">${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>`;
}

export function showActivityDetails(activityId) {
  const entry = state.activityLog.find((e) => e.id === activityId);
  if (!entry) return;
  const isMember = entry.entityType === "member";
  const isWeek = /_week$/.test(entry.entityType || "");
  const isSimple = !!SIMPLE_RESTORE[entry.entityType];
  const hasSnapshot = entry.action === "deleted" && entry.details && entry.details.snapshot;
  const canRestore = hasSnapshot && (isMember || isWeek || isSimple);
  const restoreFn = isMember ? "restoreDeletedMember" : isWeek ? "restoreDeletedWeek" : "restoreDeletedSimple";
  const restoreArgs = isSimple ? `('${entry.id}','${entry.entityType}')` : `('${entry.id}')`;

  document.getElementById("activityDetailsTitleText").textContent = entry.entityName || "—";
  document.getElementById("activityDetailsBody").innerHTML = snapshotDetailHtml(entry);
  const restoreBtn = document.getElementById("activityDetailsRestoreBtn");
  restoreBtn.style.display = canRestore ? "" : "none";
  restoreBtn.textContent = "↺ " + t("restoreActionTitle");
  restoreBtn.setAttribute("onclick", canRestore ? `${restoreFn}${restoreArgs}; closeActivityDetails();` : "");
  document.getElementById("activityDetailsOverlay").classList.add("active");
}

export function closeActivityDetails() {
  document.getElementById("activityDetailsOverlay").classList.remove("active");
}

/**
 * Admin — silinmiş bir üyeyi, o anki (silinme anındaki) tüm bilgileriyle
 * (temel alanlar + güç/1. takım gücü geçmişi + hâlâ var olan haftalara ait
 * etkinlik kayıtları) ORİJİNAL id'siyle geri yazar. Haftası da o arada
 * silinmiş bir kayıt varsa o tek kayıt atlanır (haftası olmayan bir kayıt
 * anlamsız olurdu), geri kalanı normal şekilde geri yüklenir.
 */
export async function restoreDeletedMember(activityId) {
  const entry = state.activityLog.find((e) => e.id === activityId);
  const snapshot = entry && entry.details && entry.details.snapshot;
  if (!snapshot || !snapshot.member) return;
  if (!confirm(t("confirmRestoreMember"))) return;
  try {
    const row = await createMember(snapshot.member);
    const restored = mapMember(row);
    restored.powerHistory = snapshot.powerHistory || [];
    restored.teamPowerHistory = snapshot.teamPowerHistory || [];
    state.members.push(restored);

    for (const h of snapshot.powerHistory || []) await addPowerHistoryEntry(restored.id, h.date, h.power);
    for (const h of snapshot.teamPowerHistory || []) await addTeamPowerHistoryEntry(restored.id, h.date, h.teamPower);

    for (const type of ["gvg", "svs", "ss", "kod", "other"]) {
      const store = storeFor(type);
      const weekIds = new Set(store.weeks.map((w) => w.id));
      const entries = (snapshot.entries && snapshot.entries[type]) || [];
      const payloads = entries.filter((e) => weekIds.has(e.weekId)).map((e) => entryToDbPayload(type, e, restored.id));
      if (!payloads.length) continue;
      const rows = await upsertRecordsBulk(type, payloads);
      rows.forEach((r) => store.entries.push(mapEntry(type, r)));
    }

    await logActivity("restored", "member", restored.id, { name: restored.name || "İsimsiz" }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastMemberRestored"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Admin — silinmiş bir etkinlik haftasını, o haftaya ait TÜM üyelerin
 * kayıtlarıyla birlikte ORİJİNAL id'siyle geri yazar. Kaydı olan bir üye
 * o arada silinmişse (nadir), o tek kayıt atlanır.
 */
export async function restoreDeletedWeek(activityId) {
  const entry = state.activityLog.find((e) => e.id === activityId);
  const snapshot = entry && entry.details && entry.details.snapshot;
  const match = /^(gvg|svs|ss|kod|other)_week$/.exec((entry && entry.entityType) || "");
  if (!snapshot || !snapshot.week || !match) return;
  const type = match[1];
  if (!confirm(t("confirmRestoreWeek"))) return;
  try {
    const store = storeFor(type);
    const row = await createWeek(type, { id: snapshot.week.id, label: snapshot.week.label, week_date: snapshot.week.date || null });
    const restoredWeek = mapWeek(row);
    store.weeks.push(restoredWeek);

    const memberIds = new Set(state.members.map((m) => m.id));
    const payloads = (snapshot.entries || []).filter((e) => memberIds.has(e.memberId)).map((e) => entryToDbPayload(type, e, e.memberId));
    if (payloads.length) {
      const rows = await upsertRecordsBulk(type, payloads);
      rows.forEach((r) => store.entries.push(mapEntry(type, r)));
    }

    await logActivity("restored", `${type}_week`, restoredWeek.id, { name: `${eventTypeLabel(type)}: ${restoredWeek.label}` }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastWeekRestored"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Admin — silinmiş bir göç adayını / haberi / videoyu, alt-veri taşımayan
 * (ilişkili başka kayıt kaskad silinmeyen) basit türler için ORTAK geri
 * yükleme. Anlık görüntü doğrudan orijinal id'siyle yeniden eklenir.
 */
export async function restoreDeletedSimple(activityId, entityType) {
  const entry = state.activityLog.find((e) => e.id === activityId);
  const snapshot = entry && entry.details && entry.details.snapshot;
  const handler = SIMPLE_RESTORE[entityType];
  if (!snapshot || !handler) return;
  if (!confirm(t("confirmRestoreGeneric"))) return;
  try {
    const row = await handler.create(snapshot);
    state[handler.list].push(handler.map(row));
    await logActivity("restored", entityType, row.id, { name: row.name || row.title || row.url || "İsimsiz" }, state.currentAdminUsername);
    renderAll();
    showToast(t("toastGenericRestored"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
