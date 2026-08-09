// =====================================================================
// EXC PANELİ — activity.js
// =====================================================================
// "Aktivite" sekmesi: hangi admin, ne zaman, hangi üyeyi ekledi/
// düzenledi/sildi/geri aldı — basit bir "dijital parmak izi" listesi.
// Sadece görüntülenir, düzenlenemez/silinemez (bkz. veritabanındaki
// activity_logs politikaları — kasıtlı olarak update/delete yok).
// =====================================================================

import { state, t, escapeHtml, registerRenderer } from "./ui.js";

/** Supabase'ten dönen ham aktivite satırını uygulamanın kullandığı şekle çevirir. */
export function mapActivity(row) {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityName: (row.details && row.details.name) || null,
    createdAt: row.created_at
  };
}

const ACTION_LABEL_KEY = { created: "actionCreated", updated: "actionUpdated", deleted: "actionDeleted", restored: "actionRestored" };
const ACTION_CLASS = { created: "pill-green", updated: "pill-blue", deleted: "pill-red", restored: "pill-yellow" };

export function renderActivity() {
  const rowsEl = document.getElementById("activityRows");
  if (!rowsEl) return;
  const list = state.activityLog;
  document.getElementById("activityEmpty").style.display = list.length ? "none" : "block";
  rowsEl.innerHTML = list.map((entry) => `
    <tr>
      <td>${escapeHtml((entry.createdAt || "").replace("T", " ").slice(0, 16))}</td>
      <td>${escapeHtml(entry.actor || "—")}</td>
      <td><span class="cell-pill ${ACTION_CLASS[entry.action] || "pill-gray"}">${t(ACTION_LABEL_KEY[entry.action] || "actionUpdated")}</span></td>
      <td>${escapeHtml(entry.entityName || "—")}</td>
    </tr>
  `).join("");
}
registerRenderer(renderActivity);
