// =====================================================================
// EXC PANELİ — svs.js
// =====================================================================
// SVS ve Diğer (other) sekmelerinin tablo render'ı. Bu iki sekme veri
// şekli olarak birebir aynıdır (durum: katıldı/katılmadı/bilgi yok +
// puan + mazeret) — bu yüzden ayrı bir "other.js" dosyası açmak yerine
// burada, tek bir ortak render fonksiyonu üzerinden ele alınır.
//
// Hafta/kayıt ekleme-silme mantığı (tüm etkinlik türleri için ortak)
// events.js'dedir.
// =====================================================================

import { state, t, escapeHtml, rankClass, cellInfoHtml, svsOtherCellInfo, registerRenderer } from "./ui.js";
import { filteredSortedMembers } from "./members.js";

/** SVS ve Diğer sekmeleri için ortak tablo render mantığı. */
function renderStatusTypeTable(type, store, tableElementId, emptyElementId) {
  const table = document.getElementById(tableElementId);
  document.getElementById(emptyElementId).style.display = store.weeks.length ? "none" : "block";
  const list = filteredSortedMembers();
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = `<tr>
      <th class="sticky-col">${t("thRank")}</th>
      <th class="sticky-col" style="left:90px;">${t("thUsername")}</th>
      ${store.weeks.map((week) => `<th class="week-col"><div class="week-head"><span class="wname">${escapeHtml(week.label)}</span>
        <span class="week-actions">
          <button class="icon-btn" style="width:20px;height:20px;" onclick="openWeekReportModal('${type}','${week.id}')" title="${t("weekReport")}">📋</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openWeekModal('${type}','${week.id}')" title="${type === "other" ? t("eventEditTitle") : t("weekEditTitle")}">🏷</button>
          <button class="icon-btn admin-only" style="width:20px;height:20px;" onclick="openEntryModal('${type}','${week.id}')">✎</button>
          <button class="icon-btn danger admin-only" style="width:20px;height:20px;" onclick="deleteWeek('${type}','${week.id}')">✕</button>
        </span></div></th>`).join("")}
    </tr>`;

  tbody.innerHTML = list.map((member) => `
    <tr>
      <td class="sticky-col"><span class="rank-badge ${rankClass(member.rank)}" style="font-size:11px;padding:2px 8px;">${member.rank}</span></td>
      <td class="sticky-col" style="left:90px;">${escapeHtml(member.name)}</td>
      ${store.weeks.map((week) => cellInfoHtml(svsOtherCellInfo(store, member, week))).join("")}
    </tr>
  `).join("");
}

export function renderSvs() {
  renderStatusTypeTable("svs", state.svs, "tbl-svs", "empty-svs");
}
registerRenderer(renderSvs);

export function renderOther() {
  renderStatusTypeTable("other", state.other, "tbl-other", "empty-other");
}
registerRenderer(renderOther);
