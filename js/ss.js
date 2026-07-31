// =====================================================================
// EXC PANELİ — ss.js
// =====================================================================
// SS sekmesinin tablo render'ı. Diğer etkinlik türlerinden farklı olarak
// SS haftalık "durum" yerine A/B grup ataması + katıldı mı bilgisini
// gösterir (bkz. ui.js -> ssCellInfo), bu yüzden svs.js'deki ortak
// tabloya değil kendi ayrı render mantığına sahiptir. Hafta/kayıt
// ekleme-silme mantığı (tüm etkinlik türleri için ortak) events.js'dedir.
// =====================================================================

import { state, t, escapeHtml, rankClass, cellInfoHtml, ssCellInfo, registerRenderer } from "./ui.js";
import { filteredSortedMembers } from "./members.js";

export function renderSs() {
  const table = document.getElementById("tbl-ss");
  document.getElementById("empty-ss").style.display = state.ss.weeks.length ? "none" : "block";
  const list = filteredSortedMembers();
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = `<tr>
      <th class="sticky-col">${t("thRank")}</th>
      <th class="sticky-col" style="left:90px;">${t("thUsername")}</th>
      ${state.ss.weeks.map((week) => `<th class="week-col"><div class="week-head"><span class="wname">${escapeHtml(week.label)}</span>
        <span class="week-actions">
          <button class="icon-btn" style="width:20px;height:20px;" onclick="openWeekReportModal('ss','${week.id}')" title="${t("weekReport")}">📋</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openEntryModal('ss','${week.id}')">✎</button>
          <button class="icon-btn danger admin-only" style="width:20px;height:20px;" onclick="deleteWeek('ss','${week.id}')">✕</button>
        </span></div></th>`).join("")}
    </tr>`;

  tbody.innerHTML = list.map((member) => `
    <tr>
      <td class="sticky-col"><span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
      <td class="sticky-col" style="left:90px;">${escapeHtml(member.name)}</td>
      ${state.ss.weeks.map((week) => cellInfoHtml(ssCellInfo(state.ss, member, week))).join("")}
    </tr>
  `).join("");
}
registerRenderer(renderSs);
