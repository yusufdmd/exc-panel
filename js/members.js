// =====================================================================
// EXC PANELİ — members.js
// =====================================================================
// Üye durumu, üye tablosu (arama/filtre/sıralama), üye ekle/düzenle/sil/
// eski-üyeden-geri-al akışları, rütbe kontenjan kontrolü ve üye kartındaki
// güç geçmişi + etkinlik özeti modalı bu dosyada.
//
// `activeMembers()` ve `filteredSortedMembers()` diğer domain dosyaları
// (gvg.js, svs.js, ss.js, events.js, dashboard.js) tarafından da
// kullanılır — bu yüzden export edilirler. members.js kendisi hiçbir
// domain dosyasını import ETMEZ (sadece ui.js + database.js + config.js);
// bağımlılık tek yönlüdür, döngü oluşmaz.
// =====================================================================

import { createMember, updateMember, deleteMember as dbDeleteMember, addPowerHistoryEntry } from "./database.js";
import { RANK_LIMITS } from "./config.js";
import {
  state,
  t,
  showToast,
  escapeHtml,
  formatPower,
  formatRatio,
  rankClass,
  rankChevrons,
  todayStr,
  RANK_ORDER,
  buildCampOptions,
  campLevelSortValue,
  gvgCellInfo,
  ssCellInfo,
  svsOtherCellInfo,
  sumGvgPoints,
  sumStatusPoints,
  ratioStatus,
  ratioSs,
  registerRenderer,
  renderAll
} from "./ui.js";

/** Supabase'ten dönen ham üye satırını uygulamanın kullandığı şekle çevirir. */
export function mapMember(row) {
  return {
    id: row.id,
    name: row.name,
    gameId: row.game_id,
    rank: row.rank,
    campLevel: row.camp_level,
    power: row.power,
    isOld: row.is_old,
    oldSince: row.old_since,
    joinedAt: row.joined_at,
    nameHistory: Array.isArray(row.name_history) ? row.name_history : [],
    powerHistory: []
  };
}

/** Eski (OLD) işaretli olmayan üyeleri döndürür. */
export function activeMembers() {
  return state.members.filter((member) => !member.isOld);
}

/** Etkinlik tablolarında ve toplu giriş modalında kullanılan, rütbeye sonra isme göre sıralı aktif üye listesi. */
export function filteredSortedMembers() {
  return activeMembers().sort((a, b) => {
    const rankDiff = RANK_ORDER[b.rank] - RANK_ORDER[a.rank];
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
}

// =====================================================================
// İSTATİSTİK KARTLARI
// =====================================================================
function renderStats() {
  const active = activeMembers();
  const counts = { R5: 0, R4: 0, R3: 0, R2: 0, R1: 0 };
  active.forEach((member) => { counts[member.rank] = (counts[member.rank] || 0) + 1; });
  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card"><div class="num">${active.length}</div><div class="lbl">${t("statTotal")}</div></div>
    <div class="stat-card r5"><div class="num">${counts.R5}</div><div class="lbl">R5</div></div>
    <div class="stat-card r4"><div class="num">${counts.R4}</div><div class="lbl">R4</div></div>
    <div class="stat-card r3"><div class="num">${counts.R3}</div><div class="lbl">R3</div></div>
    <div class="stat-card r2"><div class="num">${counts.R2}</div><div class="lbl">R2</div></div>
    <div class="stat-card r1"><div class="num">${counts.R1}</div><div class="lbl">R1</div></div>
  `;
}

// =====================================================================
// ÜYE TABLOSU
// =====================================================================
export function renderMembers() {
  renderStats();
  const query = (document.getElementById("memberSearch").value || "").toLowerCase().trim();
  const list = state.members.filter((member) => {
    const matchesView = state.memberView === "old" ? !!member.isOld : !member.isOld;
    const matchesRank = state.rankFilter === "ALL" || member.rank === state.rankFilter;
    const matchesQuery = !query || member.name.toLowerCase().includes(query) || String(member.gameId).toLowerCase().includes(query);
    return matchesView && matchesRank && matchesQuery;
  });

  list.sort((a, b) => {
    let valueA;
    let valueB;
    if (state.sortKey === "rank") {
      valueA = RANK_ORDER[a.rank];
      valueB = RANK_ORDER[b.rank];
      if (valueA === valueB) return (Number(b.power) || 0) - (Number(a.power) || 0); // aynı rütbede güç azalan sırada, her zaman
    } else if (state.sortKey === "name") {
      valueA = a.name.toLowerCase();
      valueB = b.name.toLowerCase();
    } else if (state.sortKey === "campSort") {
      valueA = campLevelSortValue(a.campLevel);
      valueB = campLevelSortValue(b.campLevel);
    } else {
      valueA = Number(a[state.sortKey]) || 0;
      valueB = Number(b[state.sortKey]) || 0;
    }
    if (valueA < valueB) return -1 * state.sortDir;
    if (valueA > valueB) return 1 * state.sortDir;
    return 0;
  });

  const rowsEl = document.getElementById("memberRows");
  document.getElementById("memberEmpty").style.display = list.length ? "none" : "block";
  rowsEl.innerHTML = list.map((member) => `
    <tr>
      <td><span class="rank-badge ${rankClass(member.rank)}">${member.rank}<span class="chev">${rankChevrons(member.rank)}</span></span></td>
      <td><span class="member-name">${escapeHtml(member.name)}</span>${member.isOld ? `<span class="old-tag">OLD${state.memberView === "old" && member.oldSince ? " · " + member.oldSince : ""}</span>` : ""}</td>
      <td class="member-id">${escapeHtml(String(member.gameId))}</td>
      <td class="num-cell" title="${Number(member.power) || 0}">${formatPower(member.power)}</td>
      <td class="num-cell">${escapeHtml(String(member.campLevel || "-"))}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick="openHistoryModal('${member.id}')" title="${t("powerHistory")}">📈</button>
        ${state.memberView === "old" ? `<button class="icon-btn admin-only" onclick="restoreMember('${member.id}')" title="${t("restoreMember")}">↺</button>` : ""}
        <button class="icon-btn admin-only" onclick="openMemberModal('${member.id}')">✎</button>
        <button class="icon-btn danger admin-only" onclick="deleteMember('${member.id}')">✕</button>
      </div></td>
    </tr>
  `).join("");
}
registerRenderer(renderMembers);

export function setMemberView(view) {
  state.memberView = view;
  document.querySelectorAll(".subtab[data-mv]").forEach((el) => el.classList.toggle("active", el.dataset.mv === view));
  renderMembers();
}

export function setRankFilter(rank) {
  state.rankFilter = rank;
  document.querySelectorAll(".filter-chip").forEach((el) => el.classList.toggle("active", el.dataset.rank === rank));
  renderMembers();
}

export function setSort(key) {
  if (state.sortKey === key) {
    state.sortDir *= -1;
  } else {
    state.sortKey = key;
    state.sortDir = key === "rank" ? -1 : 1; // rütbe sütunu her zaman R5-önce ile başlar
  }
  renderMembers();
}

// =====================================================================
// ÜYE MODALI (EKLE/DÜZENLE)
// =====================================================================
export function openMemberModal(id) {
  buildCampOptions();
  document.getElementById("memberEditId").value = id || "";
  if (id) {
    const member = state.members.find((m) => m.id === id);
    document.getElementById("memberModalTitle").textContent = t("memberEditTitle");
    document.getElementById("fName").value = member.name;
    document.getElementById("fGameId").value = member.gameId;
    document.getElementById("fRank").value = member.rank;
    document.getElementById("fPower").value = member.power;
    document.getElementById("fCamp").value = member.campLevel;
    state.oldFlag = !!member.isOld;
  } else {
    document.getElementById("memberModalTitle").textContent = t("memberAddTitle");
    ["fName", "fGameId", "fPower"].forEach((fieldId) => { document.getElementById(fieldId).value = ""; });
    document.getElementById("fRank").value = "R1";
    document.getElementById("fCamp").value = "1";
    state.oldFlag = false;
  }
  document.getElementById("oldToggle").classList.toggle("on", state.oldFlag);
  document.getElementById("memberOverlay").classList.add("active");
}

export function closeMemberModal() {
  document.getElementById("memberOverlay").classList.remove("active");
}

export function toggleOld() {
  state.oldFlag = !state.oldFlag;
  document.getElementById("oldToggle").classList.toggle("on", state.oldFlag);
}

/** Verilen rütbe için kontenjan doluysa uyarı metni, aksi halde null döndürür. */
function rankLimitBlockedMessage(rank, excludeId) {
  const limit = RANK_LIMITS[rank];
  if (!limit) return null;
  const activeCountAtRank = state.members.filter((m) => !m.isOld && m.rank === rank && m.id !== excludeId).length;
  return activeCountAtRank >= limit ? (rank + " rütbesi için üye sınırına ulaşıldı (maks. " + limit + ").") : null;
}

export async function saveMember() {
  const name = document.getElementById("fName").value.trim();
  const gameId = document.getElementById("fGameId").value.trim();
  if (!name || !gameId) {
    showToast(t("nameIdRequired"));
    return;
  }
  const editId = document.getElementById("memberEditId").value;
  const power = Number(document.getElementById("fPower").value) || 0;
  const rank = document.getElementById("fRank").value;
  const campLevel = document.getElementById("fCamp").value;

  if (!state.oldFlag) {
    const blockMessage = rankLimitBlockedMessage(rank, editId);
    if (blockMessage) {
      showToast(blockMessage);
      return;
    }
  }

  try {
    if (editId) {
      const index = state.members.findIndex((m) => m.id === editId);
      const previous = state.members[index];
      let oldSince = previous.oldSince || null;
      if (state.oldFlag && !previous.isOld) oldSince = todayStr();
      if (!state.oldFlag) oldSince = null;

      const nameHistory = Array.isArray(previous.nameHistory) ? [...previous.nameHistory] : [];
      if (previous.name !== name) {
        nameHistory.push({ name: previous.name, changedAt: todayStr() });
      }

      const row = await updateMember(editId, {
        name, game_id: gameId, rank, power, camp_level: campLevel,
        is_old: state.oldFlag, old_since: oldSince, name_history: nameHistory
      });

      const history = Array.isArray(previous.powerHistory) ? [...previous.powerHistory] : [];
      const lastEntry = history[history.length - 1];
      if (!lastEntry || Number(lastEntry.power) !== power) {
        const today = todayStr();
        if (lastEntry && lastEntry.date === today) lastEntry.power = power;
        else history.push({ date: today, power });
        await addPowerHistoryEntry(editId, history[history.length - 1].date, power);
      }
      state.members[index] = { ...mapMember(row), powerHistory: history };
    } else {
      const today = todayStr();
      const row = await createMember({
        name, game_id: gameId, rank, power, camp_level: campLevel,
        is_old: state.oldFlag, old_since: state.oldFlag ? today : null
      });
      await addPowerHistoryEntry(row.id, today, power);
      state.members.push({ ...mapMember(row), powerHistory: [{ date: today, power }] });
    }
    closeMemberModal();
    renderAll();
    showToast(t("toastMemberSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function deleteMember(id) {
  if (!confirm(t("confirmDeleteMember"))) return;
  try {
    await dbDeleteMember(id);
    state.members = state.members.filter((m) => m.id !== id);
    state.svs.entries = state.svs.entries.filter((e) => e.memberId !== id);
    state.gvg.entries = state.gvg.entries.filter((e) => e.memberId !== id);
    state.ss.entries = state.ss.entries.filter((e) => e.memberId !== id);
    state.other.entries = state.other.entries.filter((e) => e.memberId !== id);
    renderAll();
    showToast(t("toastMemberDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

export async function restoreMember(id) {
  const index = state.members.findIndex((m) => m.id === id);
  if (index < 0) return;
  const blockMessage = rankLimitBlockedMessage(state.members[index].rank, id);
  if (blockMessage) {
    showToast(blockMessage);
    return;
  }
  try {
    const row = await updateMember(id, { is_old: false, old_since: null });
    state.members[index] = { ...mapMember(row), powerHistory: state.members[index].powerHistory };
    renderAll();
    showToast(t("toastMemberSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

// =====================================================================
// GÜÇ GEÇMİŞİ + ETKİNLİK ÖZETİ MODALI
// =====================================================================
function buildHistoryChart(history) {
  if (!history || history.length < 2) return "";
  const width = 600;
  const height = 150;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 14;
  const padBottom = 16;
  const powers = history.map((h) => Number(h.power) || 0);
  const min = Math.min(...powers);
  const max = Math.max(...powers);
  const range = (max - min) || 1;
  const stepX = history.length > 1 ? (width - padLeft - padRight) / (history.length - 1) : 0;
  const points = history.map((h, i) => {
    const x = padLeft + i * stepX;
    const y = padTop + (height - padTop - padBottom) * (1 - ((Number(h.power) - min) / range));
    return { x, y, h };
  });
  const polylinePoints = points.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const circles = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--cyan)" stroke="var(--bg-panel)" stroke-width="2"><title>${escapeHtml(p.h.date)}: ${formatPower(p.h.power)}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%; height:150px; display:block; margin-bottom:16px;">
    <polyline points="${polylinePoints}" fill="none" stroke="var(--cyan)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${circles}
  </svg>`;
}

/** Bir üyenin SVS/GVG/SS/Diğer etkinlik özetini, tablolardakiyle aynı renk kurallarıyla üretir. */
function buildEventSummaryHtml(member) {
  const sections = [
    { key: "svs", store: state.svs, title: "SVS" },
    { key: "gvg", store: state.gvg, title: "GVG" },
    { key: "ss", store: state.ss, title: "SS" },
    { key: "other", store: state.other, title: t("subOther") }
  ];
  const html = sections.map(({ key, store, title }) => {
    if (!store.weeks.length) return "";
    let summary;
    if (key === "gvg") {
      summary = t("lbGvgTotal") + ": " + sumGvgPoints(store, member.id);
    } else if (key === "ss") {
      const ratio = ratioSs(store, member);
      summary = t("lbSsRatio") + ": " + formatRatio(ratio.num, ratio.den);
    } else {
      const ratio = ratioStatus(store, member);
      const total = sumStatusPoints(store, member.id);
      const ratioLabel = key === "svs" ? t("lbSvsRatio") : t("lbOtherRatio");
      const totalLabel = key === "svs" ? t("lbSvsTotal") : t("lbOtherTotal");
      summary = ratioLabel + ": " + formatRatio(ratio.num, ratio.den) + " · " + totalLabel + ": " + total;
    }
    const chips = store.weeks.map((week) => {
      const info = key === "gvg" ? gvgCellInfo(store, member, week)
        : key === "ss" ? ssCellInfo(store, member, week)
        : svsOtherCellInfo(store, member, week);
      return `<span class="cell-pill ${info.cls}" style="margin:3px 4px 3px 0;" title="${escapeHtml(week.label)}">${escapeHtml(week.label)}: ${info.text}</span>`;
    }).join("");
    return `<div style="margin-bottom:14px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${title} — ${summary}</div>
      <div style="display:flex;flex-wrap:wrap;">${chips}</div>
    </div>`;
  }).join("");
  return html || "";
}

/** Bir üyenin eski kullanıcı adlarını (varsa) "Ad (tarih), Ad (tarih)" biçiminde listeler. */
function buildNameHistoryHtml(member) {
  if (!Array.isArray(member.nameHistory) || !member.nameHistory.length) return "";
  const items = member.nameHistory.map((entry) => `${escapeHtml(entry.name)} (${entry.changedAt})`).join(", ");
  return `<div style="margin-bottom:14px; font-size:12px; color:var(--text-muted);">
    <span style="text-transform:uppercase; letter-spacing:0.5px; color:var(--text-dim);">${t("previousNames")}:</span>
    ${items}
  </div>`;
}

export function openHistoryModal(id) {
  state.historyMemberId = id;
  const member = state.members.find((m) => m.id === id);
  if (!member) return;
  document.getElementById("historyTitle").textContent = t("powerHistory") + " — " + member.name;
  document.getElementById("historyNameHistoryWrap").innerHTML = buildNameHistoryHtml(member);
  const history = Array.isArray(member.powerHistory) && member.powerHistory.length
    ? [...member.powerHistory].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    : [{ date: (member.joinedAt || todayStr()).slice(0, 10), power: member.power || 0 }];
  document.getElementById("historyChartWrap").innerHTML = buildHistoryChart(history);
  document.getElementById("historyEventsWrap").innerHTML = buildEventSummaryHtml(member);
  const rowsEl = document.getElementById("historyRows");
  rowsEl.innerHTML = history.map((entry, index) => {
    const previousPower = index > 0 ? history[index - 1].power : null;
    let deltaHtml = '<span style="color:var(--text-dim);">—</span>';
    if (previousPower != null) {
      const delta = Number(entry.power) - Number(previousPower);
      const color = delta > 0 ? "var(--success)" : delta < 0 ? "var(--danger)" : "var(--text-dim)";
      const sign = delta > 0 ? "+" : "";
      deltaHtml = `<span style="color:${color}; font-family:var(--font-mono); font-weight:700;">${sign}${formatPower(delta)}</span>`;
    }
    return `<tr>
      <td>${entry.date}</td>
      <td class="num-cell">${formatPower(entry.power)}</td>
      <td>${deltaHtml}</td>
    </tr>`;
  }).reverse().join("");
  document.getElementById("historyOverlay").classList.add("active");
}

export function closeHistoryModal() {
  document.getElementById("historyOverlay").classList.remove("active");
  state.historyMemberId = null;
}
