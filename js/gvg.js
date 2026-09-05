// =====================================================================
// EXC PANELİ — gvg.js
// =====================================================================
// GVG sekmesinin tablo render'ı. GVG'ye özel bir state veya CRUD yoktur;
// hafta/kayıt ekleme-silme mantığı tüm etkinlik türleri için ortak olan
// events.js'de bulunur (openEntryModal/deleteWeek onclick'leri oradan
// window'a bağlanır). Bu dosya sadece `state.gvg`'yi okuyup tabloyu çizer.
// =====================================================================

import { state, t, escapeHtml, rankClass, rowNumHtml, cellInfoHtml, gvgCellInfo, registerRenderer } from "./ui.js";
import { filteredSortedMembers } from "./members.js";

export function renderGvg() {
  const table = document.getElementById("tbl-gvg");
  document.getElementById("empty-gvg").style.display = state.gvg.weeks.length ? "none" : "block";
  const list = filteredSortedMembers();
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = `<tr>
      <th class="sticky-col">${t("thRank")}</th>
      <th class="sticky-col" style="left:105px;">${t("thUsername")}</th>
      ${state.gvg.weeks.map((week) => `<th class="week-col"><div class="week-head"><span class="wname">${escapeHtml(week.label)}</span>
        <span class="week-actions">
          <button class="icon-btn" style="width:20px;height:20px;" onclick="openWeekReportModal('gvg','${week.id}')" title="${t("weekReport")}">📋</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openWeekModal('gvg','${week.id}')" title="${t("weekEditTitle")}">🏷</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openEntryModal('gvg','${week.id}')">✎</button>
          <button class="icon-btn danger admin-only" style="width:20px;height:20px;" onclick="deleteWeek('gvg','${week.id}')">✕</button>
        </span></div></th>`).join("")}
    </tr>`;

  tbody.innerHTML = list.map((member, index) => `
    <tr>
      <td class="sticky-col">${rowNumHtml(index)}<span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
      <td class="sticky-col" style="left:105px;">${escapeHtml(member.name)}</td>
      ${state.gvg.weeks.map((week) => cellInfoHtml(gvgCellInfo(state.gvg, member, week))).join("")}
    </tr>
  `).join("");
}
registerRenderer(renderGvg);
