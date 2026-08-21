// =====================================================================
// EXC PANELİ — dashboard.js
// =====================================================================
// Puan Sıralaması (leaderboard) sekmesi. Üye tablosunun üstündeki 6
// istatistik kartı (Toplam Üye/R5..R1) burada DEĞİL, members.js'dedir —
// orijinal kodda üye tablosuyla birlikte (her arama/filtre değişiminde)
// yeniden çizildiği için oraya ait. Zamanla bu dosya, projede planlanan
// daha zengin "Dashboard" özellikleriyle (bugün aktif oyuncular, rol
// dağılımı, son işlemler, vb.) büyüyecek.
// =====================================================================

import {
  state,
  t,
  escapeHtml,
  rankClass,
  gvgColorClass,
  formatRatio,
  sumGvgPoints,
  sumStatusPoints,
  ratioStatus,
  ratioSs,
  isExempt,
  statusOf,
  RANK_ORDER,
  registerRenderer
} from "./ui.js";
import { activeMembers } from "./members.js";

const PARTICIPATION_WEEK_WINDOW = 4; // her etkinlik türü için dikkate alınan en yeni hafta sayısı
const PARTICIPATION_THRESHOLD = 0.5; // altında kalanlar kırmızıyla işaretlenir (bkz. renderBoard)

/** Bir haftanın store'daki en yeni N haftadan biri olup olmadığına bakmadan, tarihe göre en yeni N haftayı döndürür. */
function latestWeeks(store, count) {
  return [...store.weeks].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, count);
}

/**
 * Bir üyenin SVS/SS/KoD/GVG için son 4 haftalık verisine göre birleşik katılım
 * oranını hesaplar (bkz. Discord'daki "guild roster ranked by participation"
 * talebi). "Diğer" etkinlik türü bu skora dahil edilmez — talep sadece bu dört
 * türü sayıyor. Üyenin muaf olduğu haftalar (katılmadan/kullanıcı değişmeden
 * önceki haftalar) ne payda ne pay olarak sayılır — isExempt ile aynı kural.
 *
 * "Katıldı" sayılma kuralı türe göre değişir:
 *   - SVS / King of Desert: kayıt durumu "joined" ise.
 *   - SS: bir gruba atanmış VE fiilen katılmışsa (ratioSs ile aynı mantık).
 *   - GVG: 0'dan fazla puan girilmişse (GVG'de ayrı bir katıldı/katılmadı alanı yok).
 */
function participationScore(member) {
  let attended = 0;
  let applicable = 0;

  [state.svs, state.kod].forEach((store) => {
    latestWeeks(store, PARTICIPATION_WEEK_WINDOW).forEach((week) => {
      if (isExempt(member, week)) return;
      applicable++;
      const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
      if (statusOf(entry) === "joined") attended++;
    });
  });

  latestWeeks(state.ss, PARTICIPATION_WEEK_WINDOW).forEach((week) => {
    if (isExempt(member, week)) return;
    applicable++;
    const entry = state.ss.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    if (entry && entry.group && entry.attended) attended++;
  });

  latestWeeks(state.gvg, PARTICIPATION_WEEK_WINDOW).forEach((week) => {
    if (isExempt(member, week)) return;
    applicable++;
    const entry = state.gvg.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    if (entry && (Number(entry.points) || 0) > 0) attended++;
  });

  return { attended, applicable, pct: applicable ? attended / applicable : null };
}

export function setBoardSort(key) {
  if (state.boardSortKey === key) {
    state.boardSortDir *= -1;
  } else {
    state.boardSortKey = key;
    state.boardSortDir = -1;
  }
  renderBoard();
}

export function renderBoard() {
  const wrap = document.getElementById("boardWrap");
  const searchEl = document.getElementById("boardSearch");
  const query = (searchEl ? searchEl.value : "").toLowerCase().trim();
  const activeList = activeMembers().filter((member) => !query || member.name.toLowerCase().includes(query) || String(member.gameId || "").toLowerCase().includes(query));
  if (!activeList.length) {
    wrap.innerHTML = `<div class="empty-state"><h3>${t("boardEmptyTitle")}</h3><p>${t("boardEmptyDesc")}</p></div>`;
    return;
  }

  const rows = activeList.map((member) => {
    const gvgPts = sumGvgPoints(state.gvg, member.id);
    const svsPts = sumStatusPoints(state.svs, member.id);
    const svsRatio = ratioStatus(state.svs, member);
    const ssRatio = ratioSs(state.ss, member);
    const kodRatio = ratioStatus(state.kod, member);
    const otherPts = sumStatusPoints(state.other, member.id);
    const otherRatio = ratioStatus(state.other, member);
    const participation = participationScore(member);
    return { member, gvgPts, svsPts, svsRatio, ssRatio, kodRatio, otherPts, otherRatio, participation };
  });

  rows.sort((a, b) => {
    let valueA;
    let valueB;
    if (state.boardSortKey === "name") {
      valueA = a.member.name.toLowerCase();
      valueB = b.member.name.toLowerCase();
    } else if (state.boardSortKey === "rank") {
      valueA = RANK_ORDER[a.member.rank];
      valueB = RANK_ORDER[b.member.rank];
    } else if (state.boardSortKey === "svsRatio") {
      valueA = a.svsRatio.den ? a.svsRatio.num / a.svsRatio.den : -1;
      valueB = b.svsRatio.den ? b.svsRatio.num / b.svsRatio.den : -1;
    } else if (state.boardSortKey === "ssRatio") {
      valueA = a.ssRatio.den ? a.ssRatio.num / a.ssRatio.den : -1;
      valueB = b.ssRatio.den ? b.ssRatio.num / b.ssRatio.den : -1;
    } else if (state.boardSortKey === "kodRatio") {
      valueA = a.kodRatio.den ? a.kodRatio.num / a.kodRatio.den : -1;
      valueB = b.kodRatio.den ? b.kodRatio.num / b.kodRatio.den : -1;
    } else if (state.boardSortKey === "otherRatio") {
      valueA = a.otherRatio.den ? a.otherRatio.num / a.otherRatio.den : -1;
      valueB = b.otherRatio.den ? b.otherRatio.num / b.otherRatio.den : -1;
    } else if (state.boardSortKey === "participation") {
      valueA = a.participation.pct != null ? a.participation.pct : -1;
      valueB = b.participation.pct != null ? b.participation.pct : -1;
    } else {
      valueA = a[state.boardSortKey];
      valueB = b[state.boardSortKey];
    }
    if (valueA < valueB) return -1 * state.boardSortDir;
    if (valueA > valueB) return 1 * state.boardSortDir;
    return 0;
  });

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th onclick="setBoardSort('rank')">${t("thRank")}</th>
          <th onclick="setBoardSort('name')">${t("lbMember")}</th>
          <th onclick="setBoardSort('gvgPts')">${t("lbGvgTotal")}</th>
          <th onclick="setBoardSort('svsPts')">${t("lbSvsTotal")}</th>
          <th onclick="setBoardSort('svsRatio')">${t("lbSvsRatio")}</th>
          <th onclick="setBoardSort('ssRatio')">${t("lbSsRatio")}</th>
          <th onclick="setBoardSort('kodRatio')">${t("lbKodRatio")}</th>
          <th onclick="setBoardSort('otherPts')">${t("lbOtherTotal")}</th>
          <th onclick="setBoardSort('otherRatio')">${t("lbOtherRatio")}</th>
          <th onclick="setBoardSort('participation')">${t("lbParticipation")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="member-name member-name-link" onclick="openHistoryModal('${row.member.id}')" title="${t("powerHistory")}">${escapeHtml(row.member.name)}</td>
            <td class="num-cell"><span class="cell-pill ${gvgColorClass(row.gvgPts)}">${row.gvgPts}</span></td>
            <td class="num-cell" style="color:var(--cyan); font-weight:700;">${row.svsPts}</td>
            <td class="num-cell">${formatRatio(row.svsRatio.num, row.svsRatio.den)}</td>
            <td class="num-cell">${formatRatio(row.ssRatio.num, row.ssRatio.den)}</td>
            <td class="num-cell">${formatRatio(row.kodRatio.num, row.kodRatio.den)}</td>
            <td class="num-cell" style="color:var(--cyan); font-weight:700;">${row.otherPts}</td>
            <td class="num-cell">${formatRatio(row.otherRatio.num, row.otherRatio.den)}</td>
            <td class="num-cell">${participationCellHtml(row.participation)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/** Katılım oranı hücresini (x/y (%) + eşik altındaysa kırmızı uyarı) üretir. */
function participationCellHtml(participation) {
  if (participation.pct == null) return `<span class="cell-pill pill-gray">—</span>`;
  const pctLabel = Math.round(participation.pct * 100) + "%";
  const cls = participation.pct < PARTICIPATION_THRESHOLD ? "pill-red" : "pill-green";
  const title = participation.pct < PARTICIPATION_THRESHOLD ? ` title="${t("belowThresholdTitle")}"` : "";
  return `<span class="cell-pill ${cls}"${title}>${participation.attended}/${participation.applicable} (${pctLabel})</span>`;
}
/**
 * Tüm aktif üyeleri katılım eşiğine göre üç gruba (eşik altı / eşik üstü /
 * henüz veri yok) ayırıp bir rapor modalı olarak gösterir — "kimlerin hangi
 * grupta olduğunu renge göre görelim" isteğine karşılık gelir. Puan
 * Sıralaması'ndaki arama kutusundan BAĞIMSIZDIR, her zaman tüm aktif
 * üyeleri kapsar.
 */
export function openParticipationReportModal() {
  const rows = activeMembers().map((member) => ({ member, participation: participationScore(member) }));
  const above = rows
    .filter((r) => r.participation.pct != null && r.participation.pct >= PARTICIPATION_THRESHOLD)
    .sort((a, b) => b.participation.pct - a.participation.pct);
  const below = rows
    .filter((r) => r.participation.pct != null && r.participation.pct < PARTICIPATION_THRESHOLD)
    .sort((a, b) => b.participation.pct - a.participation.pct);
  const noData = rows
    .filter((r) => r.participation.pct == null)
    .sort((a, b) => a.member.name.localeCompare(b.member.name));

  const group = (title, list, cls) => {
    if (!list.length) return "";
    const items = list.map((r) => `
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">
        <span>${escapeHtml(r.member.name)}</span>
        <span class="cell-pill ${cls}">${r.participation.pct != null ? `${r.participation.attended}/${r.participation.applicable} (${Math.round(r.participation.pct * 100)}%)` : "—"}</span>
      </div>
    `).join("");
    return `<div style="margin-bottom:20px;">
      <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:8px;">${title} (${list.length})</h3>
      ${items}
    </div>`;
  };

  document.getElementById("participationReportBody").innerHTML =
    group(t("groupBelowThreshold"), below, "pill-red") +
    group(t("groupAboveThreshold"), above, "pill-green") +
    group(t("groupNoData"), noData, "pill-gray");

  document.getElementById("participationReportOverlay").classList.add("active");
}

export function closeParticipationReportModal() {
  document.getElementById("participationReportOverlay").classList.remove("active");
}

registerRenderer(renderBoard);
