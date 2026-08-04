// =====================================================================
// EXC PANELİ — migration.js
// =====================================================================
// "Göç" sekmesi: önümüzdeki göç dönemi için bize katılmak isteyen
// adayların listesi. members.js'den tamamen bağımsızdır — adaylar henüz
// üye değildir, rütbe/kamp seviyesi gibi üyeliğe özel alanları yoktur.
// Göç rengi (Altın > Mor > Mavi > Gri), adayın ne kadar değerli
// görüldüğüne dair basit bir skaladır (bkz. config.js -> MIGRATION_COLORS).
// =====================================================================

import { createMigrationProspect, updateMigrationProspect, deleteMigrationProspect as dbDeleteProspect } from "./database.js";
import {
  state,
  t,
  showToast,
  escapeHtml,
  formatPower,
  migrationColorClass,
  migrationColorLabel,
  buildMigrationColorOptions,
  MIGRATION_COLORS,
  MIGRATION_COLOR_ORDER,
  registerRenderer,
  renderAll
} from "./ui.js";

/** Supabase'ten dönen ham göç adayı satırını uygulamanın kullandığı şekle çevirir. */
export function mapProspect(row) {
  return {
    id: row.id,
    name: row.name,
    gameId: row.game_id,
    power: row.power,
    server: row.server,
    color: row.color
  };
}

/** Arama filtresi + geçerli sıralama anahtarına göre sıralanmış aday listesini döndürür. */
function sortedProspects() {
  const query = (document.getElementById("migrationSearch").value || "").toLowerCase().trim();
  const list = state.migration.filter((p) => !query || (p.name || "").toLowerCase().includes(query) || String(p.gameId || "").toLowerCase().includes(query));
  list.sort((a, b) => {
    let valueA;
    let valueB;
    if (state.migrationSortKey === "name") {
      valueA = (a.name || "").toLowerCase();
      valueB = (b.name || "").toLowerCase();
    } else if (state.migrationSortKey === "gameId") {
      valueA = String(a.gameId || "");
      valueB = String(b.gameId || "");
    } else if (state.migrationSortKey === "power") {
      valueA = Number(a.power) || 0;
      valueB = Number(b.power) || 0;
    } else if (state.migrationSortKey === "server") {
      valueA = Number(a.server) || 0;
      valueB = Number(b.server) || 0;
    } else {
      valueA = MIGRATION_COLOR_ORDER[a.color] || 0;
      valueB = MIGRATION_COLOR_ORDER[b.color] || 0;
      if (valueA === valueB) return (Number(b.power) || 0) - (Number(a.power) || 0); // aynı renkte güç azalan sırada
    }
    if (valueA < valueB) return -1 * state.migrationSortDir;
    if (valueA > valueB) return 1 * state.migrationSortDir;
    return 0;
  });
  return list;
}

/** Kaç adayın hangi göç renginde olduğunu gösteren istatistik kartlarını çizer. */
function renderMigrationStats() {
  const counts = { gold: 0, purple: 0, blue: 0, gray: 0 };
  state.migration.forEach((p) => { counts[p.color] = (counts[p.color] || 0) + 1; });
  document.getElementById("migrationStatsRow").innerHTML = `
    <div class="stat-card"><div class="num">${state.migration.length}</div><div class="lbl">${t("statMigrationTotal")}</div></div>
    ${MIGRATION_COLORS.map((color) => `<div class="stat-card ${color}"><div class="num">${counts[color]}</div><div class="lbl">${migrationColorLabel(color)}</div></div>`).join("")}
  `;
}

export function renderMigration() {
  renderMigrationStats();
  const list = sortedProspects();
  const rowsEl = document.getElementById("migrationRows");
  document.getElementById("migrationEmpty").style.display = list.length ? "none" : "block";
  rowsEl.innerHTML = list.map((p) => `
    <tr class="migration-row-${p.color}">
      <td><span class="rank-badge ${migrationColorClass(p.color)}">${migrationColorLabel(p.color)}</span></td>
      <td><span class="member-name">${escapeHtml(p.name || "—")}</span></td>
      <td class="member-id">${escapeHtml(String(p.gameId || "—"))}</td>
      <td class="num-cell" title="${Number(p.power) || 0}">${formatPower(p.power)}</td>
      <td class="num-cell">${escapeHtml(p.server != null ? String(p.server) : "—")}</td>
      <td><div class="row-actions">
        <button class="icon-btn admin-only" onclick="openProspectModal('${p.id}')">✎</button>
        <button class="icon-btn danger admin-only" onclick="deleteProspect('${p.id}')">✕</button>
      </div></td>
    </tr>
  `).join("");
}
registerRenderer(renderMigration);

export function setMigrationSort(key) {
  if (state.migrationSortKey === key) {
    state.migrationSortDir *= -1;
  } else {
    state.migrationSortKey = key;
    state.migrationSortDir = key === "color" ? -1 : 1; // renk sütunu her zaman Altın-önce ile başlar
  }
  renderMigration();
}

// =====================================================================
// ADAY MODALI (EKLE/DÜZENLE)
// =====================================================================
export function openProspectModal(id) {
  buildMigrationColorOptions();
  document.getElementById("prospectEditId").value = id || "";
  if (id) {
    const prospect = state.migration.find((p) => p.id === id);
    document.getElementById("prospectModalTitle").textContent = t("prospectEditTitle");
    document.getElementById("pName").value = prospect.name || "";
    document.getElementById("pGameId").value = prospect.gameId || "";
    document.getElementById("pPower").value = prospect.power || "";
    document.getElementById("pServer").value = prospect.server != null ? prospect.server : "";
    document.getElementById("pColor").value = prospect.color;
  } else {
    document.getElementById("prospectModalTitle").textContent = t("prospectAddTitle");
    ["pName", "pGameId", "pPower", "pServer"].forEach((fieldId) => { document.getElementById(fieldId).value = ""; });
    document.getElementById("pColor").value = "gray";
  }
  document.getElementById("prospectOverlay").classList.add("active");
}

export function closeProspectModal() {
  document.getElementById("prospectOverlay").classList.remove("active");
}

export async function saveProspect() {
  const editId = document.getElementById("prospectEditId").value;
  const name = document.getElementById("pName").value.trim();
  const gameId = document.getElementById("pGameId").value.trim();
  const power = Number(document.getElementById("pPower").value) || 0;
  const serverRaw = document.getElementById("pServer").value.trim();
  const server = serverRaw === "" ? null : (Number(serverRaw) || null);
  const color = document.getElementById("pColor").value;

  try {
    const payload = { name: name || null, game_id: gameId || null, power, server, color };
    if (editId) {
      const row = await updateMigrationProspect(editId, payload);
      const index = state.migration.findIndex((p) => p.id === editId);
      if (index >= 0) state.migration[index] = mapProspect(row);
    } else {
      const row = await createMigrationProspect(payload);
      state.migration.push(mapProspect(row));
    }
    closeProspectModal();
    renderAll();
    showToast(t("toastProspectSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function deleteProspect(id) {
  if (!confirm(t("confirmDeleteProspect"))) return;
  try {
    await dbDeleteProspect(id);
    state.migration = state.migration.filter((p) => p.id !== id);
    renderAll();
    showToast(t("toastProspectDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
