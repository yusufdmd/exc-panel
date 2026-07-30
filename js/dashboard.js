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
  RANK_ORDER,
  registerRenderer
} from "./ui.js";
import { activeMembers } from "./members.js";

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
  const activeList = activeMembers();
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
    return { member, gvgPts, svsPts, svsRatio, ssRatio, kodRatio, otherPts, otherRatio };
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
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="member-name">${escapeHtml(row.member.name)}</td>
            <td class="num-cell"><span class="cell-pill ${gvgColorClass(row.gvgPts)}">${row.gvgPts}</span></td>
            <td class="num-cell" style="color:var(--cyan); font-weight:700;">${row.svsPts}</td>
            <td class="num-cell">${formatRatio(row.svsRatio.num, row.svsRatio.den)}</td>
            <td class="num-cell">${formatRatio(row.ssRatio.num, row.ssRatio.den)}</td>
            <td class="num-cell">${formatRatio(row.kodRatio.num, row.kodRatio.den)}</td>
            <td class="num-cell" style="color:var(--cyan); font-weight:700;">${row.otherPts}</td>
            <td class="num-cell">${formatRatio(row.otherRatio.num, row.otherRatio.den)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
registerRenderer(renderBoard);
