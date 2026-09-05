// =====================================================================
// EXC PANELİ — engagement.js
// =====================================================================
// "EXC Engagement Challenge" — GVG/SVS/SS/King of Desert'te katılım
// başına 1 puan veren, admin'in başlatıp kapattığı ayrı, DÖNEMSEL bir
// yarışma sıralaması (migration_periods ile aynı desen: geçmiş dönemler
// kalıcı olarak saklanır, en fazla birinin bitiş tarihi boştur — aktif
// dönem). Ham haftalık veriye (GVG puanı, SVS/KoD durumu, SS grup+katıldı)
// hiç dokunmaz — sadece dönemin [başlangıç, bitiş] aralığındaki haftaları
// filtreleyip katılım puanına çevirir.
//
// "Yeni Dönem Başlat" hem eskiyi kapatır (o anki sıralamayı `results`
// alanına DONDURUP kalıcı hâle getirir) hem yeniyi açar — böylece geçmiş
// dönemlerin kazananı ileride her zaman geri dönüp bakılabilir kalır.
//
// Katılım kuralları (bkz. "EXC Engagement Challenge" duyurusu):
//   - SVS / King of Desert: durum "Katıldı" ise 1 puan.
//   - SS (SandStorm): bir gruba atanmış VE fiilen katılmışsa 1 puan
//     (seçilip gelmeyenin puanı olmaz, hiç seçilmeyen de puan almaz).
//   - GVG: puan, "9 sandık" karşılığı olan mevcut Yeşil Bölge eşiğine
//     (bkz. config.js -> GVG_THRESHOLDS.green) ulaşmışsa 1 puan.
// =====================================================================

import { createEngagementPeriod as dbCreateEngagementPeriod, closeEngagementPeriod as dbCloseEngagementPeriod } from "./database.js";
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

/** Supabase dönem satırını uygulama şekline çevirir. */
export function mapEngagementPeriod(row) {
  return { id: row.id, startDate: row.start_date, endDate: row.end_date || null, results: row.results || null };
}

function addDaysIso(iso, delta) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function activePeriod() {
  return state.engagementPeriods.find((p) => !p.endDate) || null;
}

/** Şu an görüntülenen dönem — seçili değilse aktif döneme, o da yoksa en yenisine düşer. */
function selectedPeriod() {
  return state.engagementPeriods.find((p) => p.id === state.engagementSelectedPeriodId) || activePeriod() || state.engagementPeriods[0] || null;
}

/** Bir etkinlik türü deposundaki, dönemin [başlangıç, bitiş] aralığına (bitiş yoksa açık uçlu) düşen haftalar. */
function periodWeeks(store, period) {
  if (!period) return [];
  return store.weeks.filter((w) => w.date && w.date >= period.startDate && (!period.endDate || w.date <= period.endDate));
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

function computeEngagementRow(member, period) {
  const svs = categoryStat(state.svs, member, periodWeeks(state.svs, period), isSvsPoint);
  const ss = categoryStat(state.ss, member, periodWeeks(state.ss, period), isSsPoint);
  const kod = categoryStat(state.kod, member, periodWeeks(state.kod, period), isKodPoint);
  const gvg = categoryStat(state.gvg, member, periodWeeks(state.gvg, period), isGvgPoint);
  return {
    // Sadece görüntüleme/eşleştirme için gereken küçük bir anlık görüntü —
    // dönem kapanıp dondurulduğunda bu haliyle kalıcı olarak saklanır,
    // üye sonradan yeniden adlandırılsa/silinse bile o anki hâli korunur.
    member: { id: member.id, name: member.name, rank: member.rank, gameId: member.gameId },
    svsPoints: svs.attended, svsApplicable: svs.applicable,
    ssPoints: ss.attended, ssApplicable: ss.applicable,
    kodPoints: kod.attended, kodApplicable: kod.applicable,
    gvgPoints: gvg.attended, gvgApplicable: gvg.applicable,
    total: svs.attended + ss.attended + kod.attended + gvg.attended,
    totalApplicable: svs.applicable + ss.applicable + kod.applicable + gvg.applicable
  };
}

/** Bir dönemin satırlarını döndürür — kapanmış (dondurulmuş) bir dönemse saklanan `results`'ı olduğu gibi, aktifse canlı hesaplar. */
function getRowsForPeriod(period) {
  if (!period) return [];
  if (period.results) return period.results;
  return activeMembers().map((member) => computeEngagementRow(member, period));
}

function hasAnyPeriodWeek(period) {
  return [state.svs, state.ss, state.kod, state.gvg].some((store) => periodWeeks(store, period).length > 0);
}

function periodOptionLabel(period) {
  return period.endDate ? `${period.startDate} – ${period.endDate}` : `${period.startDate} – ${t("engagementOngoing")}`;
}

function populatePeriodSelect(period) {
  const select = document.getElementById("engagementPeriodSelect");
  if (!select) return;
  select.innerHTML = state.engagementPeriods
    .map((p) => `<option value="${p.id}" ${period && p.id === period.id ? "selected" : ""}>${escapeHtml(periodOptionLabel(p))}</option>`)
    .join("");
}

/** Dönem seçicisinden — görüntülenen dönemi değiştirir (veri değişmez, sadece hangi dönemin gösterildiği). */
export function selectEngagementPeriod(id) {
  state.engagementSelectedPeriodId = id;
  renderEngagement();
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

  const period = selectedPeriod();
  populatePeriodSelect(period);

  const dateInput = document.getElementById("engagementNewPeriodDate");
  if (dateInput && !dateInput.value) dateInput.value = todayStr();

  if (!period) {
    wrap.innerHTML = `<div class="empty-state"><h3>${t("emptyEngagementTitle")}</h3><p>${t("emptyEngagementDesc")}</p></div>`;
    return;
  }
  if (!period.results && !hasAnyPeriodWeek(period)) {
    wrap.innerHTML = `<div class="empty-state"><h3>${t("emptyEngagementTitle")}</h3><p>${t("emptyEngagementDesc")}</p></div>`;
    return;
  }

  let rows = getRowsForPeriod(period);

  const searchEl = document.getElementById("engagementSearch");
  const query = (searchEl ? searchEl.value : "").toLowerCase().trim();
  if (query) {
    rows = rows.filter((r) => r.member.name.toLowerCase().includes(query) || String(r.member.gameId || "").toLowerCase().includes(query));
  }

  const key = state.engagementSortKey;
  const dir = state.engagementSortDir;
  rows = [...rows].sort((a, b) => {
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
            <td class="num-cell" style="color:var(--cyan-ink); font-weight:700;">${formatRatio(row.total, row.totalApplicable)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/**
 * Admin — "🔄 Yeni Dönem Başlat": varsa aktif dönemi seçilen tarihten bir
 * gün öncesiyle kapatıp o anki sıralamayı KALICI olarak dondurur, sonra
 * seçilen tarihten başlayan yeni bir aktif dönem açar. Ham etkinlik
 * verisine hiç dokunmaz — sadece bu hesaplamanın dönem sınırları değişir.
 */
export async function startNewEngagementPeriod() {
  const dateInput = document.getElementById("engagementNewPeriodDate");
  const selectedDate = (dateInput && dateInput.value) || todayStr();
  const current = activePeriod();
  if (current && selectedDate <= current.startDate) {
    showToast(t("engagementNewPeriodMustBeAfterStart"));
    return;
  }
  if (!confirm(t("confirmStartNewEngagementPeriod").replace("{date}", selectedDate))) return;
  try {
    if (current) {
      const endDate = addDaysIso(selectedDate, -1);
      const frozenRows = activeMembers().map((member) => computeEngagementRow(member, current));
      await dbCloseEngagementPeriod(current.id, endDate, frozenRows);
      current.endDate = endDate;
      current.results = frozenRows;
    }
    const row = await dbCreateEngagementPeriod(selectedDate);
    const newPeriod = mapEngagementPeriod(row);
    state.engagementPeriods.unshift(newPeriod);
    state.engagementSelectedPeriodId = newPeriod.id;
    if (dateInput) dateInput.value = "";
    renderEngagement();
    showToast(t("toastEngagementPeriodStarted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Admin — "🏁 Dönemi Bitir": sadece mevcut aktif dönemi bugünün tarihiyle
 * kapatıp o anki sıralamayı KALICI olarak dondurur — yeni bir dönem AÇMAZ.
 * "Yeni Dönem Başlat"tan bağımsız, ayrı bir adımdır: admin dönemi bitirip
 * kazananı ilan ettikten sonra, yeni dönemi istediği an ayrıca başlatabilir
 * (bu arada aktif dönem olmaz, ki bu tamamen normaldir).
 */
export async function endEngagementPeriod() {
  const current = activePeriod();
  if (!current) {
    showToast(t("engagementNoActivePeriod"));
    return;
  }
  const endDate = todayStr();
  if (endDate < current.startDate) {
    showToast(t("engagementNewPeriodMustBeAfterStart"));
    return;
  }
  if (!confirm(t("confirmEndEngagementPeriod").replace("{date}", endDate))) return;
  try {
    const frozenRows = activeMembers().map((member) => computeEngagementRow(member, current));
    await dbCloseEngagementPeriod(current.id, endDate, frozenRows);
    current.endDate = endDate;
    current.results = frozenRows;
    state.engagementSelectedPeriodId = current.id;
    renderEngagement();
    showToast(t("toastEngagementPeriodEnded"));
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
 * hesabına DEĞİL) görünen, o an seçili dönemdeki her hafta için kimin
 * puan alıp almadığını tek tek gösteren detaylı döküm. Mevcut ortak
 * "Genel Rapor" modalını (bkz. events.js -> openOverallReportModal)
 * paylaşır — sadece içeriğini kendi tablosuyla doldurur. Hafta bazlı
 * detay her zaman canlı hesaplanır (ham veri hiç silinmediği için kapanmış
 * dönemlerde de doğru sonucu verir).
 */
export function openEngagementReportModal() {
  const period = selectedPeriod();
  if (!period) return;
  const rows = getRowsForPeriod(period).slice().sort((a, b) => b.total - a.total);
  const svsWeeks = periodWeeks(state.svs, period);
  const ssWeeks = periodWeeks(state.ss, period);
  const kodWeeks = periodWeeks(state.kod, period);
  const gvgWeeks = periodWeeks(state.gvg, period);

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
