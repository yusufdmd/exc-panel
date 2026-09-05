// =====================================================================
// EXC PANELİ — engagement.js
// =====================================================================
// "EXC Engagement Challenge" — GVG/SVS/SS/King of Desert'te katılım
// başına 1 puan veren, admin'in elle başlattığı/sıfırladığı ayrı bir
// DÖNEMSEL yarışma sıralaması. Ham haftalık veriye (GVG puanı, SVS/KoD
// durumu, SS grup+katıldı) hiç dokunmaz — sadece dönem başlangıç
// tarihinden itibaren olan haftaları filtreleyip katılım puanına çevirir.
// Aynı üyenin/haftanın tüm geçmişi ilgili etkinlik sekmesinde olduğu gibi
// görünmeye devam eder; bu sadece ayrı bir "görünüm/hesaplama"dır.
//
// Katılım kuralları (bkz. "EXC Engagement Challenge" duyurusu):
//   - SVS / King of Desert: durum "Katıldı" ise 1 puan.
//   - SS (SandStorm): bir gruba atanmış VE fiilen katılmışsa 1 puan
//     (seçilip gelmeyenin puanı olmaz, hiç seçilmeyen de puan almaz).
//   - GVG: puan, "9 sandık" karşılığı olan mevcut Yeşil Bölge eşiğine
//     (bkz. config.js -> GVG_THRESHOLDS.green) ulaşmışsa 1 puan.
// =====================================================================

import { startNewEngagementPeriod as dbStartNewEngagementPeriod } from "./database.js";
import { state, t, escapeHtml, rankClass, isExempt, showToast, todayStr, formatRatio, RANK_ORDER, registerRenderer } from "./ui.js";
import { activeMembers } from "./members.js";
import { GVG_THRESHOLDS } from "./config.js";

// Kategori başına "puan sayılır mı" kuralları — hem özet tablo hem de
// admin-only haftalık rapor AYNI bu fonksiyonları kullanır, birbirinden
// sapma riski olmasın diye.
const isSvsPoint = (e) => !!e && e.status === "joined";
const isSsPoint = (e) => !!e && !!e.group && !!e.attended;
const isKodPoint = (e) => !!e && e.status === "joined";
const isGvgPoint = (e) => !!e && (Number(e.points) || 0) >= GVG_THRESHOLDS.green;

/** Bir etkinlik türü deposundaki, dönem başlangıcından itibaren (dahil) olan haftalar. */
function periodWeeks(store) {
  const start = state.engagementPeriodStart;
  if (!start) return [];
  return store.weeks.filter((w) => w.date && w.date >= start);
}

/** Verilen haftalar içinde, üyenin muaf olmadığı hafta sayısı (payda) ve `isPoint` şartını sağladığı hafta sayısı (pay). */
function categoryStat(store, member, weeks, isPoint) {
  let attended = 0;
  let applicable = 0;
  weeks.forEach((week) => {
    if (isExempt(member, week)) return;
    applicable++;
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    if (isPoint(entry)) attended++;
  });
  return { attended, applicable };
}

function computeEngagementRow(member) {
  const svs = categoryStat(state.svs, member, periodWeeks(state.svs), isSvsPoint);
  const ss = categoryStat(state.ss, member, periodWeeks(state.ss), isSsPoint);
  const kod = categoryStat(state.kod, member, periodWeeks(state.kod), isKodPoint);
  const gvg = categoryStat(state.gvg, member, periodWeeks(state.gvg), isGvgPoint);
  return {
    member,
    svsPoints: svs.attended, svsApplicable: svs.applicable,
    ssPoints: ss.attended, ssApplicable: ss.applicable,
    kodPoints: kod.attended, kodApplicable: kod.applicable,
    gvgPoints: gvg.attended, gvgApplicable: gvg.applicable,
    total: svs.attended + ss.attended + kod.attended + gvg.attended
  };
}

function hasAnyPeriodWeek() {
  return [state.svs, state.ss, state.kod, state.gvg].some((store) => periodWeeks(store).length > 0);
}

export function setEngagementSort(key) {
  if (state.engagementSortKey === key) {
    state.engagementSortDir *= -1;
  } else {
    state.engagementSortKey = key;
    state.engagementSortDir = key === "name" ? 1 : -1;
  }
  renderEngagement();
}

export function renderEngagement() {
  const wrap = document.getElementById("engagementWrap");
  if (!wrap) return;

  const periodLabel = document.getElementById("engagementPeriodLabel");
  if (periodLabel) periodLabel.textContent = t("engagementPeriodLabel").replace("{date}", state.engagementPeriodStart || "—");

  // Tarih seçiciyi sadece admin henüz dokunmadıysa bugüne ayarla — realtime/
  // yoklama tetiklediği her yeniden çizimde admin'in seçtiği tarihin üzerine
  // YAZILMAZ (bkz. startNewEngagementPeriod).
  const dateInput = document.getElementById("engagementNewPeriodDate");
  if (dateInput && !dateInput.value) dateInput.value = todayStr();

  if (!hasAnyPeriodWeek()) {
    wrap.innerHTML = `<div class="empty-state"><h3>${t("emptyEngagementTitle")}</h3><p>${t("emptyEngagementDesc")}</p></div>`;
    return;
  }

  const searchEl = document.getElementById("engagementSearch");
  const query = (searchEl ? searchEl.value : "").toLowerCase().trim();
  const rows = activeMembers()
    .filter((m) => !query || m.name.toLowerCase().includes(query) || String(m.gameId || "").toLowerCase().includes(query))
    .map(computeEngagementRow);

  const key = state.engagementSortKey;
  const dir = state.engagementSortDir;
  rows.sort((a, b) => {
    let valueA;
    let valueB;
    if (key === "name") {
      valueA = a.member.name.toLowerCase();
      valueB = b.member.name.toLowerCase();
    } else if (key === "rank") {
      valueA = RANK_ORDER[a.member.rank];
      valueB = RANK_ORDER[b.member.rank];
    } else {
      valueA = a[key];
      valueB = b[key];
    }
    if (valueA < valueB) return -1 * dir;
    if (valueA > valueB) return 1 * dir;
    return 0;
  });

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="sticky-col" onclick="setEngagementSort('rank')">${t("thRank")}</th>
          <th class="sticky-col" style="left:70px;" onclick="setEngagementSort('name')">${t("lbMember")}</th>
          <th onclick="setEngagementSort('svsPoints')">SVS</th>
          <th onclick="setEngagementSort('ssPoints')">SS</th>
          <th onclick="setEngagementSort('kodPoints')">King of Desert</th>
          <th onclick="setEngagementSort('gvgPoints')">GVG</th>
          <th onclick="setEngagementSort('total')">${t("thEngagementTotal")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td class="sticky-col"><span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="sticky-col member-name" style="left:70px;">${escapeHtml(row.member.name)}</td>
            <td class="num-cell">${formatRatio(row.svsPoints, row.svsApplicable)}</td>
            <td class="num-cell">${formatRatio(row.ssPoints, row.ssApplicable)}</td>
            <td class="num-cell">${formatRatio(row.kodPoints, row.kodApplicable)}</td>
            <td class="num-cell">${formatRatio(row.gvgPoints, row.gvgApplicable)}</td>
            <td class="num-cell" style="color:var(--cyan-ink); font-weight:700;">${row.total}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/** Admin — "🔄 Yeni Dönem Başlat": dönem başlangıcını seçilen tarihe çeker (ham etkinlik verisine dokunmaz, sadece bu hesaplamanın başlangıç noktasını değiştirir). */
export async function startNewEngagementPeriod() {
  const dateInput = document.getElementById("engagementNewPeriodDate");
  const selectedDate = (dateInput && dateInput.value) || todayStr();
  if (!confirm(t("confirmStartNewEngagementPeriod").replace("{date}", selectedDate))) return;
  try {
    await dbStartNewEngagementPeriod(selectedDate);
    state.engagementPeriodStart = selectedDate;
    renderEngagement();
    showToast(t("toastEngagementPeriodStarted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir kategori için, dönemdeki her haftayı ayrı bir renkli işaret (chip) olarak üretir — hafta bazında kim kaçırmış görmek için. */
function periodWeekChips(store, member, weeks, isPoint) {
  if (!weeks.length) return `<span style="color:var(--text-dim); font-size:12px;">—</span>`;
  return weeks.map((week) => {
    const exempt = isExempt(member, week);
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    const earned = !exempt && isPoint(entry);
    const cls = exempt ? "pill-gray" : earned ? "pill-green" : "pill-red";
    const mark = exempt ? "—" : earned ? "✓" : "✕";
    return `<span class="cell-pill ${cls}" style="margin:2px; display:inline-block;" title="${escapeHtml(week.label)}">${escapeHtml(week.label)}: ${mark}</span>`;
  }).join("");
}

/**
 * Admin-only "📊 Genel Rapor" — sadece admin oturumuna (paylaşılan "üye"
 * hesabına DEĞİL) görünen, dönemdeki her hafta için kimin puan alıp
 * almadığını tek tek gösteren detaylı döküm. Mevcut ortak "Genel Rapor"
 * modalını (bkz. events.js -> openOverallReportModal) paylaşır — sadece
 * içeriğini kendi tablosuyla doldurur.
 */
export function openEngagementReportModal() {
  const rows = activeMembers().map(computeEngagementRow).sort((a, b) => b.total - a.total);
  const svsWeeks = periodWeeks(state.svs);
  const ssWeeks = periodWeeks(state.ss);
  const kodWeeks = periodWeeks(state.kod);
  const gvgWeeks = periodWeeks(state.gvg);

  document.getElementById("overallReportBody").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${t("thRank")}</th>
          <th>${t("lbMember")}</th>
          <th>${t("thEngagementTotal")}</th>
          <th>SVS</th>
          <th>SS</th>
          <th>King of Desert</th>
          <th>GVG</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="member-name">${escapeHtml(row.member.name)}</td>
            <td class="num-cell" style="font-weight:700; color:var(--cyan-ink);">${row.total}</td>
            <td>${periodWeekChips(state.svs, row.member, svsWeeks, isSvsPoint)}</td>
            <td>${periodWeekChips(state.ss, row.member, ssWeeks, isSsPoint)}</td>
            <td>${periodWeekChips(state.kod, row.member, kodWeeks, isKodPoint)}</td>
            <td>${periodWeekChips(state.gvg, row.member, gvgWeeks, isGvgPoint)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  document.getElementById("overallReportOverlay").classList.add("active");
}

registerRenderer(renderEngagement);
