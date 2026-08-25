// =====================================================================
// EXC PANELİ — migration.js
// =====================================================================
// "Göç" sekmesi: göç dönemlere (iki haftalık pencerelere) ayrılmıştır —
// her dönemin kendi, birbirinden bağımsız aday listesi vardır. Dönemler
// EN YENİ ÖNCE (soldan sağa güncelden eskiye) sıralanır; bu, etkinlik
// haftalarının (en eski önce) TAM TERSİDİR — kullanıcı her zaman güncel
// göç dönemini ilk görmek ister (bkz. database.js -> getMigrationPeriods).
//
// Adaylar henüz üye değildir, rütbe/kamp seviyesi gibi üyeliğe özel
// alanları yoktur. Göç unvanı (Altın > Mor > Mavi > Gri > Bilinmiyor),
// adayın ne kadar değerli görüldüğüne dair basit bir skaladır (bkz.
// config.js -> MIGRATION_COLORS).
//
// "Onayla" akışı için members.js'den SADECE openMemberModal import
// edilir (members.js buradan hiçbir şey import ETMEZ — döngü oluşmaz,
// gvg.js/svs.js/ss.js/events.js'in members.js'den filteredSortedMembers
// alması ile aynı tek yönlü desen). Onaylanan adayın üye kaydına
// dönüşmesinden SONRAKİ temizlik (adayı silme) members.js -> saveMember
// içinde, state.pendingProspectApprovalId bayrağı üzerinden yapılır.
// =====================================================================

import {
  createMigrationPeriod, updateMigrationPeriod, deleteMigrationPeriod as dbDeletePeriod,
  createMigrationProspect, updateMigrationProspect, deleteMigrationProspect as dbDeleteProspect,
  deleteMigrationLead as dbDeleteLead
} from "./database.js";
import {
  state,
  t,
  showToast,
  escapeHtml,
  formatPower,
  todayStr,
  isDigitsOnly,
  migrationColorClass,
  migrationColorLabel,
  migrationStatusClass,
  migrationStatusLabel,
  buildMigrationColorOptions,
  buildProspectCampOptions,
  buildProspectElementPicker,
  setProspectElementPickerActive,
  setElementPickerActive,
  campLevelSortValue,
  elementBadge,
  elementLabel,
  MIGRATION_COLORS,
  MIGRATION_COLOR_ORDER,
  registerRenderer,
  renderAll
} from "./ui.js";
import { openMemberModal } from "./members.js";
import { openExportModal } from "./exportCsv.js";

/** "Durum" sütununu sıralarken kesinlik derecesine göre kullanılan sıra: Kesin > Yedek > Belirsiz. */
const MIGRATION_STATUS_ORDER = { certain: 2, waitlist: 1, uncertain: 0 };

/** Durum çip filtresinde gösterilen sıra (bkz. renderMigrationFilterChips). */
const MIGRATION_STATUS_VALUES = ["certain", "waitlist", "uncertain"];

/** Supabase'ten dönen ham göç dönemi satırını uygulamanın kullandığı şekle çevirir. */
export function mapPeriod(row) {
  return { id: row.id, label: row.label, date: row.period_date || "" };
}

/** Supabase'ten dönen ham göç başvurusu (genel siteden gelen) satırını uygulamanın kullandığı şekle çevirir. */
export function mapLead(row) {
  return { id: row.id, name: row.name, gameId: row.game_id, contact: row.contact, server: row.current_server, power: row.power, message: row.message, createdAt: row.created_at };
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
    status: row.status,
    failed: !!row.failed,
    confirmed: !!row.confirmed,
    note: row.note || "",
    campLevel: row.camp_level || "",
    teamPower: row.team_power || 0,
    teamElement: row.team_element || null,
    score: row.score != null ? row.score : null
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
    // Üç sekme birbirini dışlar: Adaylar (henüz onaylanmamış/başarısız değil),
    // Onayda (doğrulandı, göç edeceği kesinleşti), Başarısız.
    const matchesView = state.migrationView === "failed" ? !!p.failed
      : state.migrationView === "confirmed" ? (!p.failed && !!p.confirmed)
      : (!p.failed && !p.confirmed);
    if (!matchesView) return false;
    if (state.migrationColorFilter !== "ALL" && p.color !== state.migrationColorFilter) return false;
    if (state.migrationStatusFilter !== "ALL" && p.status !== state.migrationStatusFilter) return false;
    return !query
      || (p.name || "").toLowerCase().includes(query)
      || String(p.gameId || "").toLowerCase().includes(query)
      || String(p.server || "").includes(query);
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
    } else if (state.migrationSortKey === "campSort") {
      valueA = campLevelSortValue(a.campLevel);
      valueB = campLevelSortValue(b.campLevel);
    } else if (state.migrationSortKey === "teamPower") {
      valueA = Number(a.teamPower) || 0;
      valueB = Number(b.teamPower) || 0;
    } else if (state.migrationSortKey === "server") {
      valueA = Number(a.server) || 0;
      valueB = Number(b.server) || 0;
    } else if (state.migrationSortKey === "status") {
      // Kesinlik derecesine göre: Kesin > Yedek > Belirsiz.
      valueA = MIGRATION_STATUS_ORDER[a.status] || 0;
      valueB = MIGRATION_STATUS_ORDER[b.status] || 0;
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
  const totalLabel = state.migrationView === "failed" ? t("statMigrationFailedTotal")
    : state.migrationView === "confirmed" ? t("statMigrationConfirmedTotal")
    : t("statMigrationTotal");
  document.getElementById("migrationStatsRow").innerHTML = `
    <div class="stat-card"><div class="num">${list.length}</div><div class="lbl">${totalLabel}</div></div>
    ${MIGRATION_COLORS.map((color) => `<div class="stat-card ${color}"><div class="num">${counts[color]}</div><div class="lbl">${migrationColorLabel(color)}</div></div>`).join("")}
  `;
}

/**
 * Genel tanıtım sitesinden gelen, henüz işlenmemiş ham başvuruları çizer
 * (dönemden bağımsız, sadece admin görür). Bölüm, başvuru olmasa bile
 * HER ZAMAN görünür kalır (boş durum mesajıyla) — böylece admin bu
 * özelliğin var olduğunu ve nerede olduğunu her zaman görebilir.
 */
function renderMigrationLeads() {
  const hasLeads = state.migrationLeads.length > 0;
  document.getElementById("migrationLeadsEmpty").style.display = hasLeads ? "none" : "block";
  document.getElementById("migrationLeadsTableWrap").style.display = hasLeads ? "" : "none";
  document.getElementById("migrationLeadsRows").innerHTML = state.migrationLeads.map((lead) => `
    <tr>
      <td><span class="member-name">${escapeHtml(lead.name || "—")}</span></td>
      <td class="member-id">${escapeHtml(lead.gameId || "—")}</td>
      <td>${escapeHtml(lead.contact || "—")}</td>
      <td class="num-cell">${escapeHtml(lead.server != null ? String(lead.server) : "—")}</td>
      <td class="num-cell">${formatPower(lead.power)}</td>
      <td>${escapeHtml(lead.message || "—")}</td>
      <td>${escapeHtml((lead.createdAt || "").slice(0, 10))}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="processLead('${lead.id}')" title="${t("processLeadTitle")}">✅</button>
        <button class="icon-btn danger" onclick="dismissLead('${lead.id}')">✕</button>
      </div></td>
    </tr>
  `).join("");
}

/** Unvan (Renk) ve Durum çip filtrelerini toolbar içine çizer (bkz. setMigrationColorFilter/setMigrationStatusFilter). */
function renderMigrationFilterChips() {
  document.getElementById("migrationColorChips").innerHTML = `
    <div class="filter-chip ${state.migrationColorFilter === "ALL" ? "active" : ""}" onclick="setMigrationColorFilter('ALL')">${t("filterAll")}</div>
    ${MIGRATION_COLORS.map((color) => `<div class="filter-chip ${state.migrationColorFilter === color ? "active" : ""}" onclick="setMigrationColorFilter('${color}')">${migrationColorLabel(color)}</div>`).join("")}
  `;
  document.getElementById("migrationStatusChips").innerHTML = `
    <div class="filter-chip ${state.migrationStatusFilter === "ALL" ? "active" : ""}" onclick="setMigrationStatusFilter('ALL')">${t("filterAll")}</div>
    ${MIGRATION_STATUS_VALUES.map((status) => `<div class="filter-chip ${state.migrationStatusFilter === status ? "active" : ""}" onclick="setMigrationStatusFilter('${status}')">${migrationStatusLabel(status)}</div>`).join("")}
  `;
}

/** Unvan (Renk) çip filtresini değiştirir — sadece migration.js'e özgü, members.js'deki setRankFilter'dan bağımsızdır. */
export function setMigrationColorFilter(color) {
  state.migrationColorFilter = color;
  renderMigration();
}

/** Durum çip filtresini değiştirir. */
export function setMigrationStatusFilter(status) {
  state.migrationStatusFilter = status;
  renderMigration();
}

export function renderMigration() {
  renderMigrationLeads();
  renderMigrationPeriodTabs();
  if (!state.migrationActivePeriodId) return;
  renderMigrationFilterChips();
  const list = sortedProspects();
  renderMigrationStats(list);
  const rowsEl = document.getElementById("migrationRows");
  const view = state.migrationView; // "active" | "confirmed" | "failed"
  document.getElementById("t_copyFailedBtn").style.display = view === "failed" ? "" : "none";
  document.getElementById("migrationEmpty").style.display = list.length ? "none" : "block";
  document.getElementById("t_emptyMigrationTitle").textContent = t(
    view === "failed" ? "emptyMigrationFailedTitle" : view === "confirmed" ? "emptyMigrationConfirmedTitle" : "emptyMigrationTitle"
  );
  document.getElementById("t_emptyMigrationDesc").textContent = t(
    view === "failed" ? "emptyMigrationFailedDesc" : view === "confirmed" ? "emptyMigrationConfirmedDesc" : "emptyMigrationDesc"
  );
  rowsEl.innerHTML = list.map((p) => `
    <tr class="migration-row-${p.color}">
      <td><span class="rank-badge ${migrationColorClass(p.color)}">${migrationColorLabel(p.color)}</span>${p.score != null ? `<div style="font-size:11px; color:var(--text-dim); margin-top:2px;">${escapeHtml(String(p.score))}</div>` : ""}</td>
      <td><span class="member-name">${escapeHtml(p.name || "—")}</span>${p.note ? `<div style="font-size:11px; color:var(--text-dim); white-space:normal; max-width:220px;">${escapeHtml(p.note)}</div>` : ""}</td>
      <td class="member-id">${escapeHtml(String(p.gameId || "—"))}</td>
      <td class="num-cell" title="${Number(p.power) || 0}">${formatPower(p.power)}</td>
      <td class="num-cell">${escapeHtml(p.campLevel || "—")}</td>
      <td class="num-cell">${p.teamPower ? `${elementBadge(p.teamElement, 20)} <span style="vertical-align:middle;">${formatPower(p.teamPower)}</span>` : "—"}</td>
      <td class="num-cell">${escapeHtml(p.server != null ? String(p.server) : "—")}</td>
      <td><span class="cell-pill ${migrationStatusClass(p.status)}">${migrationStatusLabel(p.status)}</span></td>
      <td><div class="row-actions">
        ${view === "failed" ? `
          <button class="icon-btn admin-only" onclick="restoreProspect('${p.id}')" title="${t("restoreProspectTitle")}">↺</button>
          <button class="icon-btn admin-only" onclick="openProspectModal('${p.id}')">✎</button>
        ` : view === "confirmed" ? `
          <button class="icon-btn admin-only" onclick="approveProspect('${p.id}')" title="${t("approveProspectTitle")}">✅</button>
          <button class="icon-btn admin-only" onclick="unconfirmProspect('${p.id}')" title="${t("unconfirmTitle")}">↺</button>
          <button class="icon-btn admin-only" onclick="openProspectModal('${p.id}')">✎</button>
          <button class="icon-btn danger admin-only" onclick="markProspectFailed('${p.id}')" title="${t("markFailedTitle")}">🚫</button>
        ` : `
          <button class="icon-btn admin-only" onclick="markProspectConfirmed('${p.id}')" title="${t("markConfirmedTitle")}">➡️</button>
          <button class="icon-btn admin-only" onclick="openProspectModal('${p.id}')">✎</button>
          <button class="icon-btn danger admin-only" onclick="markProspectFailed('${p.id}')" title="${t("markFailedTitle")}">🚫</button>
        `}
        <button class="icon-btn danger admin-only" onclick="deleteProspect('${p.id}')">✕</button>
      </div></td>
    </tr>
  `).join("");
}
registerRenderer(renderMigration);

/** "Adaylar" / "Onayda" / "Başarısız" alt sekmeleri arasında geçiş yapar (bkz. sortedProspects). */
export function setMigrationView(view) {
  state.migrationView = view;
  document.querySelectorAll('.subtab[data-mstatus]').forEach((el) => el.classList.toggle("active", el.dataset.mstatus === view));
  renderMigration();
}

export function setMigrationSort(key) {
  if (state.migrationSortKey === key) {
    state.migrationSortDir *= -1;
  } else {
    state.migrationSortKey = key;
    state.migrationSortDir = key === "color" ? -1 : 1; // unvan sütunu her zaman Altın-önce ile başlar
  }
  renderMigration();
}

/** "Dışa Aktar" — admin, Adaylar/Onayda/Başarısız listelerinden hangilerinin dahil olacağını seçer; TÜM dönemlerden, tek bir CSV'ye birleşir. */
export function exportMigration() {
  const items = [
    { id: "active", label: t("subMigrationActive") },
    { id: "confirmed", label: t("subMigrationConfirmed") },
    { id: "failed", label: t("subMigrationFailed") }
  ];
  const viewLabel = { active: t("subMigrationActive"), confirmed: t("subMigrationConfirmed"), failed: t("subMigrationFailed") };
  openExportModal(t("exportBtn"), items, (selectedIds) => {
    const periodLabelById = {};
    state.migrationPeriods.forEach((p) => { periodLabelById[p.id] = p.label; });
    const list = state.migration.filter((p) => {
      const view = p.failed ? "failed" : p.confirmed ? "confirmed" : "active";
      return selectedIds.includes(view);
    });
    const rows = [[
      t("lblPeriodLabel"), t("thColor"), t("lblProspectScore"), t("thUsername"), t("thId"), t("thPower"), t("thCamp"),
      t("lblTeamPower"), t("lblTeamElement"), t("thServer"), t("thStatus"), t("lblProspectNote"), t("thListView")
    ]];
    list.forEach((p) => {
      const view = p.failed ? "failed" : p.confirmed ? "confirmed" : "active";
      rows.push([
        periodLabelById[p.periodId] || "", migrationColorLabel(p.color), p.score != null ? p.score : "", p.name || "", p.gameId || "",
        Number(p.power) || 0, p.campLevel || "", Number(p.teamPower) || 0,
        p.teamElement ? elementLabel(p.teamElement) : t("elementNone"),
        p.server != null ? p.server : "", migrationStatusLabel(p.status), p.note || "", viewLabel[view]
      ]);
    });
    return { filename: "exc-paneli-goc-" + todayStr() + ".csv", rows };
  });
}

// =====================================================================
// ADAY MODALI (EKLE/DÜZENLE)
// =====================================================================
export function openProspectModal(id) {
  if (!id && !state.migrationActivePeriodId) {
    showToast(t("needPeriodFirst"));
    return;
  }
  state.pendingLeadProcessingId = null; // varsayılan: normal ekleme/düzenleme, "İşle" akışı değil (bkz. processLead)
  buildMigrationColorOptions();
  buildProspectCampOptions();
  buildProspectElementPicker();
  document.getElementById("prospectEditId").value = id || "";
  if (id) {
    const prospect = state.migration.find((p) => p.id === id);
    document.getElementById("prospectModalTitle").textContent = t("prospectEditTitle");
    document.getElementById("pName").value = prospect.name || "";
    document.getElementById("pGameId").value = prospect.gameId || "";
    document.getElementById("pPower").value = prospect.power || "";
    document.getElementById("pServer").value = prospect.server != null ? prospect.server : "";
    document.getElementById("pColor").value = prospect.color;
    document.getElementById("pScore").value = prospect.score != null ? prospect.score : "";
    document.getElementById("pStatus").value = prospect.status;
    document.getElementById("pNote").value = prospect.note || "";
    document.getElementById("pCamp").value = prospect.campLevel || "";
    document.getElementById("pTeamPower").value = prospect.teamPower || "";
    document.getElementById("pTeamElement").value = prospect.teamElement || "";
    setProspectElementPickerActive(prospect.teamElement || "");
  } else {
    document.getElementById("prospectModalTitle").textContent = t("prospectAddTitle");
    ["pName", "pGameId", "pPower", "pServer", "pNote", "pCamp", "pTeamPower", "pTeamElement", "pScore"].forEach((fieldId) => { document.getElementById(fieldId).value = ""; });
    document.getElementById("pColor").value = "unknown";
    document.getElementById("pStatus").value = "uncertain";
    setProspectElementPickerActive("");
  }
  document.getElementById("prospectOverlay").classList.add("active");
}

export function closeProspectModal() {
  document.getElementById("prospectOverlay").classList.remove("active");
  state.pendingLeadProcessingId = null;
}

export async function saveProspect() {
  const editId = document.getElementById("prospectEditId").value;
  const name = document.getElementById("pName").value.trim();
  const gameId = document.getElementById("pGameId").value.trim();
  const powerRaw = document.getElementById("pPower").value.trim();
  const serverRaw = document.getElementById("pServer").value.trim();
  const teamPowerRaw = document.getElementById("pTeamPower").value.trim();
  const scoreRaw = document.getElementById("pScore").value.trim();

  if (gameId && !isDigitsOnly(gameId, 15)) {
    showToast(t("invalidGameId"));
    return;
  }
  if ((powerRaw && !isDigitsOnly(powerRaw)) || (serverRaw && !isDigitsOnly(serverRaw)) || (teamPowerRaw && !isDigitsOnly(teamPowerRaw)) || (scoreRaw && !isDigitsOnly(scoreRaw))) {
    showToast(t("invalidNumberField"));
    return;
  }

  const power = Number(powerRaw) || 0;
  const server = serverRaw === "" ? null : (Number(serverRaw) || null);
  const color = document.getElementById("pColor").value;
  const score = scoreRaw === "" ? null : (Number(scoreRaw) || null);
  const status = document.getElementById("pStatus").value;
  const note = document.getElementById("pNote").value.trim();
  const campLevel = document.getElementById("pCamp").value || null;
  const teamPower = Number(teamPowerRaw) || 0;
  const teamElement = document.getElementById("pTeamElement").value || null;

  try {
    if (editId) {
      const payload = { name: name || null, game_id: gameId || null, power, server, color, score, status, note: note || null, camp_level: campLevel, team_power: teamPower, team_element: teamElement };
      const row = await updateMigrationProspect(editId, payload);
      const index = state.migration.findIndex((p) => p.id === editId);
      if (index >= 0) state.migration[index] = mapProspect(row);
    } else {
      const payload = { period_id: state.migrationActivePeriodId, name: name || null, game_id: gameId || null, power, server, color, score, status, note: note || null, camp_level: campLevel, team_power: teamPower, team_element: teamElement };
      const row = await createMigrationProspect(payload);
      state.migration.push(mapProspect(row));

      // "İşle" akışından geldiyse (bkz. processLead), aday başarıyla oluşturulduktan
      // sonra ham başvuruyu da temizler. Kendi try/catch'inde tutulur ki temizlik
      // başarısız olsa bile adayın oluşturulduğu doğru şekilde bildirilsin.
      if (state.pendingLeadProcessingId) {
        const leadId = state.pendingLeadProcessingId;
        state.pendingLeadProcessingId = null;
        try {
          await dbDeleteLead(leadId);
          state.migrationLeads = state.migrationLeads.filter((l) => l.id !== leadId);
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }
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

/**
 * Bir adayı, yeterli kontenjan olmadığı (veya başka bir nedenle göç
 * gerçekleşmediği) için "Başarısız" olarak işaretler — aday "Adaylar"
 * listesinden kaybolup "Başarısız" sekmesinde görünür hale gelir.
 */
export async function markProspectFailed(id) {
  if (!confirm(t("confirmMarkFailed"))) return;
  try {
    const row = await updateMigrationProspect(id, { failed: true });
    const index = state.migration.findIndex((p) => p.id === id);
    if (index >= 0) state.migration[index] = mapProspect(row);
    renderAll();
    showToast(t("toastProspectFailed"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** "Başarısız" işaretini kaldırıp adayı tekrar normal "Adaylar" listesine döndürür. */
export async function restoreProspect(id) {
  try {
    const row = await updateMigrationProspect(id, { failed: false });
    const index = state.migration.findIndex((p) => p.id === id);
    if (index >= 0) state.migration[index] = mapProspect(row);
    renderAll();
    showToast(t("toastProspectSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Seçili dönemdeki "Başarısız" adayların TAMAMINI, en yeni göç dönemine
 * (state.migrationPeriods dizisinde EN YENİ ÖNCE sıralı olduğu için ilk
 * eleman) kopyalar — kontenjan yetersizliği yüzünden bu dönem göç
 * edemeyenler, bir sonraki dönemde tekrar değerlendirmeye alınabilsin
 * diye. Kopyalar "Belirsiz" durumuyla (baştan değerlendirme) ve
 * onaylanmamış/başarısız olmayan haliyle eklenir; bu dönemdeki
 * "Başarısız" kayıtları SİLİNMEZ, sadece bir kopyası oluşturulur.
 */
export async function copyFailedToNextPeriod() {
  const targetPeriod = state.migrationPeriods[0];
  if (!targetPeriod || targetPeriod.id === state.migrationActivePeriodId) {
    showToast(t("needNewerPeriodForCopy"));
    return;
  }
  const failedList = state.migration.filter((p) => p.periodId === state.migrationActivePeriodId && p.failed);
  if (!failedList.length) {
    showToast(t("noFailedToCopy"));
    return;
  }
  if (!confirm(t("confirmCopyFailedToNext") + ` (${failedList.length} → ${targetPeriod.label})`)) return;
  try {
    for (const p of failedList) {
      const row = await createMigrationProspect({
        period_id: targetPeriod.id, name: p.name || null, game_id: p.gameId || null, power: p.power,
        server: p.server, color: p.color, score: p.score, status: "uncertain", note: p.note || null,
        camp_level: p.campLevel || null, team_power: p.teamPower, team_element: p.teamElement
      });
      state.migration.push(mapProspect(row));
    }
    renderAll();
    showToast(t("toastCopiedToNextPeriod"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Bir adayı "Onayda" olarak işaretler — doğrulandığı, unvanının belli
 * olduğu ve göç edeceğinin kesinleştiği anlamına gelir. Aday "Adaylar"
 * listesinden kaybolup "Onayda" sekmesinde görünür hale gelir; oradan
 * "Üye Olarak Onayla" (approveProspect) ile gerçek üyeliğe dönüştürülür.
 * Onaya alınan bir aday artık kesinleşmiş sayılır — formdaki "Durum"
 * seçimi ne olursa olsun status da "certain" (Kesin) olarak zorlanır.
 */
export async function markProspectConfirmed(id) {
  if (!confirm(t("confirmMarkConfirmed"))) return;
  try {
    const row = await updateMigrationProspect(id, { confirmed: true, status: "certain" });
    const index = state.migration.findIndex((p) => p.id === id);
    if (index >= 0) state.migration[index] = mapProspect(row);
    renderAll();
    showToast(t("toastProspectConfirmed"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** "Onayda" işaretini kaldırıp adayı tekrar normal "Adaylar" listesine döndürür. */
export async function unconfirmProspect(id) {
  try {
    const row = await updateMigrationProspect(id, { confirmed: false });
    const index = state.migration.findIndex((p) => p.id === id);
    if (index >= 0) state.migration[index] = mapProspect(row);
    renderAll();
    showToast(t("toastProspectSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Bir göç adayını üyeliğe dönüştürme akışını başlatır: onay istenir,
 * onaylanırsa Üyeler sekmesine geçilip üye ekleme modalı, adayın bilinen
 * bilgileriyle (isim/ID/güç/kamp seviyesi/1. takım) önceden doldurulmuş
 * halde açılır. Rütbe gibi hâlâ eksik kalan alanları admin doldurup
 * "Kaydet"e bastığında, aday göç listesinden otomatik olarak silinir
 * (bkz. members.js -> saveMember).
 */
export function approveProspect(id) {
  const prospect = state.migration.find((p) => p.id === id);
  if (!prospect) return;
  if (!confirm(t("confirmApproveProspect"))) return;
  window.switchTab("members");
  openMemberModal();
  state.pendingProspectApprovalId = id;
  document.getElementById("fName").value = prospect.name || "";
  document.getElementById("fGameId").value = prospect.gameId || "";
  document.getElementById("fPower").value = prospect.power || "";
  if (prospect.campLevel) document.getElementById("fCamp").value = prospect.campLevel;
  document.getElementById("fTeamPower").value = prospect.teamPower || "";
  document.getElementById("fTeamElement").value = prospect.teamElement || "";
  setElementPickerActive(prospect.teamElement || "");
}

/** Aday element seçicide bir elemente tıklanınca çağrılır; zaten seçiliyse tekrar tıklamak seçimi kaldırır. */
export function setProspectTeamElement(element) {
  const hidden = document.getElementById("pTeamElement");
  const next = hidden.value === element ? "" : element;
  hidden.value = next;
  setProspectElementPickerActive(next);
}

/**
 * Genel siteden gelen ham bir başvuruyu göç adayına dönüştürme akışını
 * başlatır: seçili dönem içinde aday ekleme formu, başvurunun bilinen
 * bilgileriyle (isim/sunucu/güç) önceden doldurulmuş halde açılır.
 * "Kaydet"e basıldığında başvuru otomatik olarak silinir (bkz. saveProspect).
 */
export function processLead(id) {
  if (!state.migrationActivePeriodId) {
    showToast(t("needPeriodFirst"));
    return;
  }
  const lead = state.migrationLeads.find((l) => l.id === id);
  if (!lead) return;
  openProspectModal();
  state.pendingLeadProcessingId = id;
  document.getElementById("pName").value = lead.name || "";
  document.getElementById("pGameId").value = lead.gameId || "";
  document.getElementById("pServer").value = lead.server != null ? lead.server : "";
  document.getElementById("pPower").value = lead.power || "";
}

export async function dismissLead(id) {
  if (!confirm(t("confirmDismissLead"))) return;
  try {
    await dbDeleteLead(id);
    state.migrationLeads = state.migrationLeads.filter((l) => l.id !== id);
    renderAll();
    showToast(t("toastLeadDismissed"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}
