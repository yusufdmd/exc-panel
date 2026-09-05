// =====================================================================
// EXC PANELİ — kod.js
// =====================================================================
// King of Desert sekmesinin tablo render'ı. SVS/Diğer'den farkı: puan
// tutulmaz, sadece katıldı/katılmadı/bilgi yok durumu + mazeret vardır
// (bkz. ui.js -> attendanceCellInfo). Hafta/kayıt ekleme-silme mantığı
// (tüm etkinlik türleri için ortak) events.js'dedir.
// =====================================================================

import { state, t, escapeHtml, rankClass, rowNumHtml, cellInfoHtml, attendanceCellInfo, registerRenderer } from "./ui.js";
import { filteredSortedMembers } from "./members.js";

export function renderKod() {
  const table = document.getElementById("tbl-kod");
  document.getElementById("empty-kod").style.display = state.kod.weeks.length ? "none" : "block";
  const list = filteredSortedMembers();
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = `<tr>
      <th class="sticky-col">${t("thRank")}</th>
      <th class="sticky-col" style="left:105px;">${t("thUsername")}</th>
      ${state.kod.weeks.map((week) => `<th class="week-col"><div class="week-head"><span class="wname">${escapeHtml(week.label)}</span>
        <span class="week-actions">
          <button class="icon-btn" style="width:20px;height:20px;" onclick="openWeekReportModal('kod','${week.id}')" title="${t("weekReport")}">📋</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openWeekModal('kod','${week.id}')" title="${t("weekEditTitle")}">🏷</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openEntryModal('kod','${week.id}')">✎</button>
          <button class="icon-btn danger admin-only" style="width:20px;height:20px;" onclick="deleteWeek('kod','${week.id}')">✕</button>
        </span></div></th>`).join("")}
    </tr>`;

  tbody.innerHTML = list.map((member, index) => `
    <tr>
      <td class="sticky-col">${rowNumHtml(index)}<span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
      <td class="sticky-col" style="left:105px;">${escapeHtml(member.name)}</td>
      ${state.kod.weeks.map((week) => cellInfoHtml(attendanceCellInfo(state.kod, member, week))).join("")}
    </tr>
  `).join("");
}
registerRenderer(renderKod);
