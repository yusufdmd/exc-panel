// =====================================================================
// EXC PANELİ — kodgvg.js
// =====================================================================
// "KOD - GVG" sekmesinin tablo render'ı — GVG ile BİREBİR aynı mantık
// (puanlama eşikleri, hücre renkleri), sadece ayrı bir haftalar/kayıtlar
// deposunda (state.kodgvg) tutulur (bkz. gvg.js). Hafta/kayıt ekleme-silme
// mantığı tüm etkinlik türleri için ortak olan events.js'de bulunur
// (openEntryModal/deleteWeek onclick'leri oradan window'a bağlanır). Bu
// dosya sadece `state.kodgvg`'yi okuyup tabloyu çizer.
// =====================================================================

import { state, t, escapeHtml, rankClass, rowNumHtml, cellInfoHtml, gvgCellInfo, registerRenderer, sortMembersForWeek, weekSortIcon } from "./ui.js";
import { filteredSortedMembers } from "./members.js";

export function renderKodGvg() {
  const table = document.getElementById("tbl-kodgvg");
  document.getElementById("empty-kodgvg").style.display = state.kodgvg.weeks.length ? "none" : "block";
  const list = sortMembersForWeek("kodgvg", state.kodgvg, filteredSortedMembers());
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = `<tr>
      <th class="sticky-col">${t("thRank")}</th>
      <th class="sticky-col" style="left:105px;">${t("thUsername")}</th>
      ${state.kodgvg.weeks.map((week) => `<th class="week-col"><div class="week-head"><span class="wname">${escapeHtml(week.label)}</span>
        <span class="week-actions">
          <button class="icon-btn" style="width:20px;height:20px;" onclick="setEventWeekSort('kodgvg','${week.id}')" title="${t("sortByWeekTitle")}">${weekSortIcon("kodgvg", week.id)}</button>
          <button class="icon-btn" style="width:20px;height:20px;" onclick="openWeekReportModal('kodgvg','${week.id}')" title="${t("weekReport")}">📋</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openWeekModal('kodgvg','${week.id}')" title="${t("weekEditTitle")}">🏷</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openEntryModal('kodgvg','${week.id}')">✎</button>
          <button class="icon-btn danger admin-only" style="width:20px;height:20px;" onclick="deleteWeek('kodgvg','${week.id}')">✕</button>
        </span></div></th>`).join("")}
    </tr>`;

  tbody.innerHTML = list.map((member, index) => `
    <tr>
      <td class="sticky-col">${rowNumHtml(index)}<span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
      <td class="sticky-col" style="left:105px;">${escapeHtml(member.name)}</td>
      ${state.kodgvg.weeks.map((week) => cellInfoHtml(gvgCellInfo(state.kodgvg, member, week))).join("")}
    </tr>
  `).join("");
}
registerRenderer(renderKodGvg);
