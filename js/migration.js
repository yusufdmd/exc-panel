// =====================================================================
// EXC PANELİ — migration.js
// =====================================================================
// "Göç" sekmesi: göç dönemlere (iki haftalık pencerelere) ayrılmıştır —
// her dönemin kendi, birbirinden bağımsız aday listesi vardır. Dönemler
// EN YENİ ÖNCE (soldan sağa güncelden eskiye) sıralanır; bu, etkinlik
// haftalarının (en eski önce) TAM TERSİDİR — kullanıcı her zaman güncel
// göç dönemini ilk görmek ister (bkz. database.js -> getMigrationPeriods).
//
// members.js'den tamamen bağımsızdır — adaylar henüz üye değildir,
// rütbe/kamp seviyesi gibi üyeliğe özel alanları yoktur. Göç unvanı
// (Altın > Mor > Mavi > Gri), adayın ne kadar değerli görüldüğüne dair
// basit bir skaladır (bkz. config.js -> MIGRATION_COLORS).
// =====================================================================

import {
  createMigrationPeriod, updateMigrationPeriod, deleteMigrationPeriod as dbDeletePeriod,
  createMigrationProspect, updateMigrationProspect, deleteMigrationProspect as dbDeleteProspect
} from "./database.js";
import {
  state,
  t,
  showToast,
  escapeHtml,
  formatPower,
  todayStr,
  migrationColorClass,
  migrationColorLabel,
  migrationStatusClass,
  migrationStatusLabel,
  buildMigrationColorOptions,
  MIGRATION_COLORS,
  MIGRATION_COLOR_ORDER,
  registerRenderer,
  renderAll
} from "./ui.js";

/** Supabase'ten dönen ham göç dönemi satırını uygulamanın kullandığı şekle çevirir. */
export function mapPeriod(row) {
  return { id: row.id, label: row.label, date: row.period_date || "" };
}

/** Supabase'ten dönen ham göç adayı satırını uygulamanın kullandığı şekle çevirir. */
export function mapProspect(row) {
  return {
    id: row.id,
    periodId: row.period_id,
    name: row.name,
    gameId: row.game_id,
    power: row.power,
    server: row.server,
    color: row.color,
    status: row.status
  };
}

// =====================================================================
// DÖNEM SEÇİCİ (en yeni solda) + DÖNEM MODALI (EKLE/DÜZENLE)
// =====================================================================
/** Seçili dönem artık listede yoksa (silindiyse) veya hiç seçilmediyse en yeni (ilk) döneme geçer. */
function ensureActivePeriod() {
  const stillExists = state.migrationPeriods.some((p) => p.id === state.migrationActivePeriodId);
  if (!stillExists) {
    state.migrationActivePeriodId = state.migrationPeriods.length ? state.migrationPeriods[0].id : null;
  }
}

function renderMigrationPeriodTabs() {
  ensureActivePeriod();
  const tabsEl = document.getElementById("migrationPeriodTabs");
  tabsEl.innerHTML = state.migrationPeriods.map((period) => `
    <div class="subtab ${period.id === state.migrationActivePeriodId ? "active" : ""}" onclick="selectMigrationPeriod('${period.id}')">
      <span>${escapeHtml(period.label)}</span>
      <span class="admin-only period-actions">
        <button class="icon-btn" style="width:18px;height:18px;" onclick="event.stopPropagation(); openPeriodModal('${period.id}')" title="${t("weekEditTitle")}">🏷</button>
        <button class="icon-btn danger" style="width:18px;height:18px;" onclick="event.stopPropagation(); deletePeriod('${period.id}')">✕</button>
      </span>
    </div>
  `).join("");

  const hasPeriods = state.migrationPeriods.length > 0;
  document.getElementById("migrationPeriodEmpty").style.display = hasPeriods ? "none" : "block";
  document.getElementById("migrationPeriodContent").style.display = hasPeriods ? "" : "none";
}

export function selectMigrationPeriod(id) {
  state.migrationActivePeriodId = id;
  renderMigration();
}

export function openPeriodModal(id) {
  document.getElementById("periodEditId").value = id || "";
  if (id) {
    const period = state.migrationPeriods.find((p) => p.id === id);
    document.getElementById("periodModalTitle").textContent = t("periodEditTitle");
    document.getElementById("prLabel").value = period ? period.label : "";
    document.getElementById("prDate").value = period ? period.date : "";
  } else {
    document.getElementById("periodModalTitle").textContent = t("periodAddTitle");
    document.getElementById("prLabel").value = "Dönem " + (state.migrationPeriods.length + 1);
    document.getElementById("prDate").value = todayStr();
  }
  document.getElementById("periodOverlay").classList.add("active");
}

export function closePeriodModal() {
  document.getElementById("periodOverlay").classList.remove("active");
}

export async function savePeriod() {
  const editId = document.getElementById("periodEditId").value;
  const label = document.getElementById("prLabel").value.trim();
  if (!label) {
    showToast(t("periodNameRequired"));
    return;
  }
  const periodDate = document.getElementById("prDate").value || null;

  try {
    if (editId) {
      const row = await updateMigrationPeriod(editId, { label, period_date: periodDate });
      const index = state.migrationPeriods.findIndex((p) => p.id === editId);
      if (index >= 0) state.migrationPeriods[index] = mapPeriod(row);
    } else {
      const row = await createMigrationPeriod({ label, period_date: periodDate });
      state.migrationPeriods.push(mapPeriod(row));
      state.migrationActivePeriodId = row.id;
    }
    // Yeni/güncellenen dönemin sıradaki (en yeni önce) konumu değişmiş olabilir; sunucudaki sıralamayı yansıtmak için yerel listeyi de aynı kurala göre sıralıyoruz.
    state.migrationPeriods.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    closePeriodModal();
    renderAll();
    showToast(t("toastPeriodSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function deletePeriod(id) {
  if (!confirm(t("confirmDeletePeriod"))) return;
  try {
    await dbDeletePeriod(id);
    state.migrationPeriods = state.migrationPeriods.filter((p) => p.id !== id);
    state.migration = state.migration.filter((p) => p.periodId !== id);
    if (state.migrationActivePeriodId === id) state.migrationActivePeriodId = null;
    renderAll();
    showToast(t("toastPeriodDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

// =====================================================================
// ADAY LİSTESİ (seçili döneme ait)
// =====================================================================
/** Arama filtresi + geçerli sıralama anahtarına göre, SEÇİLİ DÖNEME ait sıralanmış aday listesini döndürür. */
function sortedProspects() {
  const query = (document.getElementById("migrationSearch").value || "").toLowerCase().trim();
  const list = state.migration.filter((p) => {
    if (p.periodId !== state.migrationActivePeriodId) return false;
    return !query || (p.name || "").toLowerCase().includes(query) || String(p.gameId || "").toLowerCase().includes(query);
  });
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
    } else if (state.migrationSortKey === "status") {
      valueA = a.status === "certain" ? 1 : 0;
      valueB = b.status === "certain" ? 1 : 0;
    } else {
      valueA = MIGRATION_COLOR_ORDER[a.color] || 0;
      valueB = MIGRATION_COLOR_ORDER[b.color] || 0;
      if (valueA === valueB) return (Number(b.power) || 0) - (Number(a.power) || 0); // aynı unvanda güç azalan sırada
    }
    if (valueA < valueB) return -1 * state.migrationSortDir;
    if (valueA > valueB) return 1 * state.migrationSortDir;
    return 0;
  });
  return list;
}

/** Seçili dönemdeki adayların kaçının hangi unvanda olduğunu gösteren istatistik kartlarını çizer. */
function renderMigrationStats(list) {
  const counts = { gold: 0, purple: 0, blue: 0, gray: 0, unknown: 0 };
  list.forEach((p) => { counts[p.color] = (counts[p.color] || 0) + 1; });
  document.getElementById("migrationStatsRow").innerHTML = `
    <div class="stat-card"><div class="num">${list.length}</div><div class="lbl">${t("statMigrationTotal")}</div></div>
    ${MIGRATION_COLORS.map((color) => `<div class="stat-card ${color}"><div class="num">${counts[color]}</div><div class="lbl">${migrationColorLabel(color)}</div></div>`).join("")}
  `;
}

export function renderMigration() {
  renderMigrationPeriodTabs();
  if (!state.migrationActivePeriodId) return;
  const list = sortedProspects();
  renderMigrationStats(list);
  const rowsEl = document.getElementById("migrationRows");
  document.getElementById("migrationEmpty").style.display = list.length ? "none" : "block";
  rowsEl.innerHTML = list.map((p) => `
    <tr class="migration-row-${p.color}">
      <td><span class="rank-badge ${migrationColorClass(p.color)}">${migrationColorLabel(p.color)}</span></td>
      <td><span class="member-name">${escapeHtml(p.name || "—")}</span></td>
      <td class="member-id">${escapeHtml(String(p.gameId || "—"))}</td>
      <td class="num-cell" title="${Number(p.power) || 0}">${formatPower(p.power)}</td>
      <td class="num-cell">${escapeHtml(p.server != null ? String(p.server) : "—")}</td>
      <td><span class="cell-pill ${migrationStatusClass(p.status)}">${migrationStatusLabel(p.status)}</span></td>
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
    state.migrationSortDir = key === "color" ? -1 : 1; // unvan sütunu her zaman Altın-önce ile başlar
  }
  renderMigration();
}

// =====================================================================
// ADAY MODALI (EKLE/DÜZENLE)
// =====================================================================
export function openProspectModal(id) {
  if (!id && !state.migrationActivePeriodId) {
    showToast(t("needPeriodFirst"));
    return;
  }
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
    document.getElementById("pStatus").value = prospect.status;
  } else {
    document.getElementById("prospectModalTitle").textContent = t("prospectAddTitle");
    ["pName", "pGameId", "pPower", "pServer"].forEach((fieldId) => { document.getElementById(fieldId).value = ""; });
    document.getElementById("pColor").value = "unknown";
    document.getElementById("pStatus").value = "uncertain";
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
  const status = document.getElementById("pStatus").value;

  try {
    if (editId) {
      const payload = { name: name || null, game_id: gameId || null, power, server, color, status };
      const row = await updateMigrationProspect(editId, payload);
      const index = state.migration.findIndex((p) => p.id === editId);
      if (index >= 0) state.migration[index] = mapProspect(row);
    } else {
      const payload = { period_id: state.migrationActivePeriodId, name: name || null, game_id: gameId || null, power, server, color, status };
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
