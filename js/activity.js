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

import { createMember, createWeek, upsertRecordsBulk, addPowerHistoryEntry, addTeamPowerHistoryEntry, logActivity } from "./database.js";
import { state, t, showToast, escapeHtml, renderAll, registerRenderer } from "./ui.js";
import { mapMember } from "./members.js";
import { mapWeek, mapEntry, storeFor, entryToDbPayload, eventTypeLabel } from "./events.js";

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

/** Aktivite tablosundaki "Tür" sütunu için, entity_type değerini kısa okunur bir etikete çevirir. */
function entityTypeLabel(entityType) {
  if (!entityType) return "—";
  if (entityType === "member") return t("lbMember");
  const match = /^(gvg|svs|ss|kod|other)_(week|entries)$/.exec(entityType);
  if (!match) return entityType;
  const [, type, kind] = match;
  return kind === "week" ? `${eventTypeLabel(type)} ${t("thWeeks")}` : `${eventTypeLabel(type)} ${t("entryKindLabel")}`;
}

export function renderActivity() {
  const rowsEl = document.getElementById("activityRows");
  if (!rowsEl) return;
  const list = state.activityLog;
  document.getElementById("activityEmpty").style.display = list.length ? "none" : "block";
  rowsEl.innerHTML = list.map((entry) => {
    const hasSnapshot = entry.action === "deleted" && entry.details && entry.details.snapshot;
    const isMember = entry.entityType === "member";
    const isWeek = /_week$/.test(entry.entityType || "");
    const canRestore = hasSnapshot && (isMember || isWeek);
    const restoreBtn = canRestore
      ? `<button class="icon-btn admin-only" onclick="${isMember ? "restoreDeletedMember" : "restoreDeletedWeek"}('${entry.id}')" title="${t("restoreActionTitle")}">↺</button>`
      : "";
    return `<tr>
      <td>${escapeHtml((entry.createdAt || "").replace("T", " ").slice(0, 16))}</td>
      <td>${escapeHtml(entry.actor || "—")}</td>
      <td><span class="cell-pill ${ACTION_CLASS[entry.action] || "pill-gray"}">${t(ACTION_LABEL_KEY[entry.action] || "actionUpdated")}</span></td>
      <td>${escapeHtml(entityTypeLabel(entry.entityType))}</td>
      <td>${escapeHtml(entry.entityName || "—")}</td>
      <td>${restoreBtn}</td>
    </tr>`;
  }).join("");
}
registerRenderer(renderActivity);

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
