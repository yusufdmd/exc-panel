// =====================================================================
// EXC PANELİ — engagement.js
// =====================================================================
// "EXC Engagement Challenge" — GVG/KOD-GVG/SVS/SS/King of Desert'te katılım
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
//   - SS (SandStorm): haftada azami 1 puan (diğer türlerle aynı ağırlık),
//     iki yoldan biriyle kazanılır: (a) seçilmediyse (kontenjan dolu)
//     sadece BAŞVURMUŞ olmak yeterli, (b) seçildiyse fiilen KATILMIŞ
//     olmak gerekir. Hiç başvurmamak, ya da seçilip gelmemek 0 puandır.
//   - GVG / KOD - GVG: puan, "9 sandık" karşılığı olan kendi Yeşil Bölge
//     eşiğine (bkz. config.js -> GVG_THRESHOLDS.gvg.green / .kodgvg.green —
//     GVG 6 gün, KOD-GVG 7 gün üzerinden hesaplandığı için eşikleri FARKLI)
//     ulaşmışsa 1 puan — ikisi birbirinden tamamen ayrı haftalar/kayıtlar
//     olarak tutulur (bkz. state.gvg / state.kodgvg).
// =====================================================================

import { createEngagementPeriod as dbCreateEngagementPeriod, closeEngagementPeriod as dbCloseEngagementPeriod, deleteEngagementPeriod as dbDeleteEngagementPeriod, restoreEngagementPeriod as dbRestoreEngagementPeriod, getEngagementPeriods, setSetting as dbSetSetting, logActivity } from "./database.js";
import { state, t, escapeHtml, rankClass, rowNumHtml, isExempt, showToast, todayStr, formatRatio, RANK_ORDER, registerRenderer } from "./ui.js";
import { activeMembers } from "./members.js";
import { GVG_THRESHOLDS } from "./config.js";
import { supabase } from "./supabase.js";

// Kategori başına "puan sayılır mı" kuralları — hem özet tablo hem de
// admin-only haftalık rapor AYNI bu fonksiyonları kullanır, birbirinden
// sapma riski olmasın diye.
const isSvsPoint = (e) => !!e && e.status === "joined";
const isKodPoint = (e) => !!e && e.status === "joined";
const isGvgPoint = (e) => !!e && (Number(e.points) || 0) >= GVG_THRESHOLDS.gvg.green;
const isKodGvgPoint = (e) => !!e && (Number(e.points) || 0) >= GVG_THRESHOLDS.kodgvg.green;
/**
 * SS: sadece etkinlik listesine alınan (bir gruba atanmış) üyeler için o hafta
 * değerlendirilir — katıldıysa 1/1, katılmadıysa 0/1. Listeye alınmayanlar
 * (sadece başvuru yapmış ya da hiç kaydı olmayan) için o SS haftası hesaba
 * HİÇ girmez: ne puan alır ne de paydaya eklenir (bkz. isSsApplicable).
 */
const isSsPoint = (e) => !!e && !!e.group && !!e.attended;
const isSsApplicable = (e) => !!e && !!e.group;

/** Supabase dönem satırını uygulama şekline çevirir. */
export function mapEngagementPeriod(row) {
  return { id: row.id, seq: row.seq || null, startDate: row.start_date, endDate: row.end_date || null, results: row.results || null };
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

/**
 * Verilen haftalar içinde, üyenin muaf olmadığı hafta sayısı (payda) ve `isPoint` şartını sağladığı hafta sayısı (pay).
 * `isApplicable` verilirse, kaydı bu şartı sağlamayan haftalar da (SS'de listeye alınmamak gibi) paydaya hiç eklenmez.
 */
function categoryStat(store, member, weeks, isPoint, isApplicable) {
  let attended = 0;
  let applicable = 0;
  weeks.forEach((week) => {
    if (isExempt(member, week)) return;
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    if (isApplicable && !isApplicable(entry)) return;
    applicable++;
    if (isPoint(entry)) attended++;
  });
  return { attended, applicable };
}

function computeEngagementRow(member, period) {
  const svs = categoryStat(state.svs, member, periodWeeks(state.svs, period), isSvsPoint);
  const ss = categoryStat(state.ss, member, periodWeeks(state.ss, period), isSsPoint, isSsApplicable);
  const kod = categoryStat(state.kod, member, periodWeeks(state.kod, period), isKodPoint);
  const gvg = categoryStat(state.gvg, member, periodWeeks(state.gvg, period), isGvgPoint);
  const kodgvg = categoryStat(state.kodgvg, member, periodWeeks(state.kodgvg, period), isKodGvgPoint);
  return {
    // Sadece görüntüleme/eşleştirme için gereken küçük bir anlık görüntü —
    // dönem kapanıp dondurulduğunda bu haliyle kalıcı olarak saklanır,
    // üye sonradan yeniden adlandırılsa/silinse bile o anki hâli korunur.
    member: { id: member.id, name: member.name, rank: member.rank, gameId: member.gameId },
    svsPoints: svs.attended, svsApplicable: svs.applicable,
    ssPoints: ss.attended, ssApplicable: ss.applicable,
    kodPoints: kod.attended, kodApplicable: kod.applicable,
    gvgPoints: gvg.attended, gvgApplicable: gvg.applicable,
    kodGvgPoints: kodgvg.attended, kodGvgApplicable: kodgvg.applicable,
    total: svs.attended + ss.attended + kod.attended + gvg.attended + kodgvg.attended,
    totalApplicable: svs.applicable + ss.applicable + kod.applicable + gvg.applicable + kodgvg.applicable
  };
}

/** Bir dönemin satırlarını döndürür — kapanmış (dondurulmuş) bir dönemse saklanan `results`'ı olduğu gibi, aktifse canlı hesaplar. */
function getRowsForPeriod(period) {
  if (!period) return [];
  if (period.results) return period.results;
  return activeMembers().map((member) => computeEngagementRow(member, period));
}

function hasAnyPeriodWeek(period) {
  return [state.svs, state.ss, state.kod, state.gvg, state.kodgvg].some((store) => periodWeeks(store, period).length > 0);
}

function periodOptionLabel(period) {
  const dates = period.endDate ? `${period.startDate} – ${period.endDate}` : `${period.startDate} – ${t("engagementOngoing")}`;
  return period.seq ? `${t("periodWord")} ${period.seq} (${dates})` : dates;
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
  const winners = rows.filter((r) => r.winnerRank).sort((a, b) => a.winnerRank - b.winnerRank);
  const winnersHtml = winners.length
    ? `<div class="engagement-winners"><strong>${t("engagementWinnersTitle")}:</strong>${winners.map((r) => `<span class="cell-pill pill-yellow">${r.winnerRank === 1 ? "🥇" : "🥈"} ${escapeHtml(r.member.name)} · ${r.total}</span>`).join("")}</div>`
    : "";

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

  wrap.innerHTML = `${winnersHtml}
    <table>
      <thead>
        <tr>
          <th class="sticky-col" onclick="setEngagementSort('rank')">${t("thRank")}</th>
          <th class="sticky-col" style="left:105px;" onclick="setEngagementSort('name')">${t("lbMember")}</th>
          <th onclick="setEngagementSort('svsPoints')">SVS</th>
          <th onclick="setEngagementSort('ssPoints')">SS</th>
          <th onclick="setEngagementSort('kodPoints')">King of Desert</th>
          <th onclick="setEngagementSort('gvgPoints')">GVG</th>
          <th onclick="setEngagementSort('kodGvgPoints')">KOD - GVG</th>
          <th onclick="setEngagementSort('total')">${t("thEngagementTotal")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td class="sticky-col">${rowNumHtml(index)}<span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="sticky-col member-name" style="left:105px;">${escapeHtml(row.member.name)}${row.winnerRank === 1 ? " 🥇" : row.winnerRank === 2 ? " 🥈" : ""}</td>
            <td class="num-cell">${formatRatio(row.svsPoints, row.svsApplicable)}</td>
            <td class="num-cell">${formatRatio(row.ssPoints, row.ssApplicable)}</td>
            <td class="num-cell">${formatRatio(row.kodPoints, row.kodApplicable)}</td>
            <td class="num-cell">${formatRatio(row.gvgPoints, row.gvgApplicable)}</td>
            <td class="num-cell">${formatRatio(row.kodGvgPoints, row.kodGvgApplicable)}</td>
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
let pendingEngagementClose = null;

/** "Dönemi Bitir": önce kazananları (1. ve 2.) seçtirir, sonra dönemi kapatır. */
export function endEngagementPeriod() {
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
  const rows = activeMembers().map((member) => computeEngagementRow(member, current)).sort((a, b) => b.total - a.total);
  pendingEngagementClose = { period: current, endDate, rows };

  const placeholder = `<option value="">${escapeHtml(t("engagementWinnersPick"))}</option>`;
  const options = rows.map((row) => `<option value="${escapeHtml(row.member.id)}">${escapeHtml(row.member.name)} — ${row.total}</option>`).join("");
  document.getElementById("ewTitle").textContent = t("engagementWinnersTitle");
  document.getElementById("ewFirstLabel").textContent = t("engagementWinnersFirst");
  document.getElementById("ewSecondLabel").textContent = t("engagementWinnersSecond");
  document.getElementById("ewFirst").innerHTML = placeholder + options;
  document.getElementById("ewSecond").innerHTML = placeholder + options;
  document.getElementById("ewConfirm").textContent = t("engagementWinnersConfirm");
  document.getElementById("ewCancel").textContent = t("cancel");
  document.getElementById("engagementWinnersOverlay").classList.add("active");
}

export function closeEngagementWinners() {
  pendingEngagementClose = null;
  document.getElementById("engagementWinnersOverlay").classList.remove("active");
}

export async function confirmEngagementWinners() {
  if (!pendingEngagementClose) return;
  const firstId = document.getElementById("ewFirst").value;
  const secondId = document.getElementById("ewSecond").value;
  if (!firstId || !secondId) {
    showToast(t("engagementWinnersMissing"));
    return;
  }
  if (firstId === secondId) {
    showToast(t("engagementWinnersSame"));
    return;
  }
  const { period, endDate, rows } = pendingEngagementClose;
  if (!confirm(t("confirmEndEngagementPeriod").replace("{date}", endDate))) return;
  const frozenRows = rows.map((row) => ({
    ...row,
    winnerRank: row.member.id === firstId ? 1 : row.member.id === secondId ? 2 : null
  }));
  try {
    await dbCloseEngagementPeriod(period.id, endDate, frozenRows);
    period.endDate = endDate;
    period.results = frozenRows;
    state.engagementSelectedPeriodId = period.id;
    closeEngagementWinners();
    renderEngagement();
    showToast(t("toastEngagementPeriodEnded"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Admin — "🗑 Dönemi Sil": o an seçili dönemi (aktif ya da geçmiş/donmuş
 * fark etmez) kalıcı olarak siler. Ham GVG/SVS/SS/KoD verisine dokunmaz —
 * sadece bu dönemin kaydını kaldırır; donmuş bir dönemse o dönemin
 * kazananı/sıralaması bir daha geri getirilemez.
 */
/** Aktivite'den geri yükleme: aktif bir dönem zaten varken ikinci bir aktif dönem oluşturmaz. */
export async function restoreEngagementPeriodFromSnapshot(snapshot) {
  if (!snapshot.end_date && state.engagementPeriods.some((p) => !p.endDate)) {
    throw new Error("Zaten aktif bir katılım yarışması dönemi var.");
  }
  return dbRestoreEngagementPeriod(snapshot);
}

export async function deleteEngagementPeriod() {
  const period = selectedPeriod();
  if (!period) return;
  if (!confirm(t("confirmDeleteEngagementPeriod").replace("{date}", periodOptionLabel(period)))) return;
  try {
    await dbDeleteEngagementPeriod(period.id);
    await logActivity("deleted", "engagement_period", period.id, {
      name: periodOptionLabel(period),
      snapshot: { id: period.id, seq: period.seq || null, start_date: period.startDate, end_date: period.endDate || null, results: period.results || null }
    }, state.currentAdminUsername);
    // Veritabanı silmeden sonra kalan dönemleri boşluksuz yeniden numaralar
    // (bkz. sql/renumber_engagement_periods.sql) — yeni numaraları hemen göstermek için tekrar çekilir.
    state.engagementPeriods = state.engagementPeriods.filter((p) => p.id !== period.id);
    try {
      state.engagementPeriods = (await getEngagementPeriods()).map(mapEngagementPeriod);
    } catch (refreshError) {
      console.error(refreshError); // silme başarılı; numaralar realtime/yoklama ile yine güncellenir
    }
    if (state.engagementSelectedPeriodId === period.id) state.engagementSelectedPeriodId = null;
    renderEngagement();
    showToast(t("toastEngagementPeriodDeleted"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/** Bir kategori için, dönemdeki her haftayı ayrı bir renkli işaret (chip) olarak üretir — hafta bazında kim kaçırmış görmek için. */
function periodWeekChips(store, member, weeks, isPoint, isApplicable) {
  if (!weeks.length) return `<span style="color:var(--text-dim); font-size:12px;">—</span>`;
  return weeks.map((week) => {
    const entry = store.entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    const exempt = isExempt(member, week) || (isApplicable && !isApplicable(entry)); // sayılmayan hafta da gri "—" görünür
    const earned = !exempt && isPoint(entry);
    const cls = exempt ? "pill-gray" : earned ? "pill-green" : "pill-red";
    const mark = exempt ? "—" : earned ? "✓" : "✕";
    return `<span class="cell-pill ${cls}" style="margin:2px; display:inline-block;" title="${escapeHtml(week.label)}">${escapeHtml(week.label)}: ${mark}</span>`;
  }).join("");
}

// =====================================================================
// "🏆 Katılım Panosu" — Engagement Challenge yüzdesine göre üyeleri renkli
// dilimlere ayırıp, ekran görüntüsü alınıp Discord'da paylaşılmaya uygun
// bir pano hâlinde gösterir. Ham veriyi hiç DEĞİŞTİRMEZ, sadece "Genel
// Rapor"un da kullandığı getRowsForPeriod çıktısını farklı biçimde
// gruplar. Hiç uygulanabilir haftası olmayan (totalApplicable=0) üyeler
// — henüz katılma şansı bulamadıkları için — panoya hiç dahil edilmez.
//
// 5 dilim var: %100 (tek başına — ödülü kazanan dilim), sonra 3 tanesi
// admin tarafından ayarlanabilen (bkz. state.engagementBoardTiers,
// "settings" tablosunda kalıcı — Supabase'in genel anahtar/değer
// mekanizması, bkz. database.js -> getSetting/setSetting) eşiğe göre,
// en altta da geri kalan herkes. Varsayılan eşikler 70/50/30.
//
// Görünüm, Discord'a otomatik giden görselle AYNI şablondan gelir (bkz.
// js/engagementBoardTemplate.js — panel/index.html'de klasik <script> ile
// yüklenir, window.EngagementBoardTemplate). Pano kendi piksel ölçüsünde
// (1137x1383) çizilip modalın genişliğine transform:scale ile sığdırılır.
// =====================================================================
const BOARD_BG_URL = "../images/engagement-board-bg.jpg";
const BOARD_FONT_URL = "../fonts/OpenSans-Bold.ttf";

/** Dönemin satırlarını 5 dilime (100 / t2 / t3 / t4 / altı) ayırır; her dilimde isimler alfabetik. */
function buildEngagementBoardColumns(period) {
  const [t2, t3, t4] = state.engagementBoardTiers;
  const mins = [100, t2, t3, t4, 0];
  const columns = mins.map(() => []);
  getRowsForPeriod(period).filter((row) => row.totalApplicable > 0).forEach((row) => {
    const pct = (row.total / row.totalApplicable) * 100;
    const index = mins.findIndex((min) => pct >= min);
    columns[index === -1 ? mins.length - 1 : index].push(row.member.name || "—");
  });
  columns.forEach((names) => names.sort((a, b) => a.localeCompare(b)));
  return columns;
}

/** Panoyu modala (hem genişlik hem yükseklik olarak) tamamı görünecek şekilde sığdırır. */
function scaleEngagementBoard() {
  const scaler = document.getElementById("engagementBoardScaler");
  if (!scaler) return;
  const { BOARD_WIDTH, BOARD_HEIGHT } = window.EngagementBoardTemplate;
  const frame = scaler.parentElement;
  const body = document.getElementById("engagementBoardBody");
  const maxHeight = parseFloat(getComputedStyle(body).maxHeight) || window.innerHeight * 0.72;
  const scale = Math.min(1, body.clientWidth / BOARD_WIDTH, maxHeight / BOARD_HEIGHT);
  scaler.style.transform = `scale(${scale})`;
  frame.style.width = `${Math.floor(BOARD_WIDTH * scale)}px`;
  frame.style.height = `${Math.floor(BOARD_HEIGHT * scale)}px`;
}

export async function openEngagementBoardModal() {
  const period = selectedPeriod();
  if (!period) return;
  const template = window.EngagementBoardTemplate;
  if (!template) {
    showToast("Error");
    return;
  }
  const body = document.getElementById("engagementBoardBody");
  body.innerHTML = `
    <div class="eb-frame">
      <div id="engagementBoardScaler" class="eb-scaler">
        ${template.buildEngagementBoardMarkup({
          bgUrl: BOARD_BG_URL,
          fontUrl: BOARD_FONT_URL,
          tiers: state.engagementBoardTiers,
          columns: buildEngagementBoardColumns(period),
          periodLine: template.formatPeriodLine(period)
        })}
      </div>
    </div>`;
  document.getElementById("engagementBoardOverlay").classList.add("active");
  scaleEngagementBoard();
  // İsim sığdırma, gömülü font yüklendikten SONRA ölçülmeli (yoksa yedek fontun genişliğine göre hesaplanır).
  try { await document.fonts.load('700 16px "EBX Sans"'); } catch (_) { /* font yüklenemedi — yedek fontla devam */ }
  template.fitEngagementBoardNames(body);
}
window.addEventListener("resize", scaleEngagementBoard);

export function closeEngagementBoardModal() {
  document.getElementById("engagementBoardOverlay").classList.remove("active");
}

// =====================================================================
// "📣 Discord'a Gönder" — admin, seçili dönemin panosunu KENDİ yazdığı
// metinle (ör. dönem sonu tebrik mesajı) Discord'a elle gönderir. Görsel
// panelden değil sunucuda üretilir (bkz. api/send-engagement-board.js):
// webhook URL'si tarayıcıya hiç gelmez, görsel her zaman aynı şablondan çıkar.
// Otomatik haftalık gönderim bu buton geldiğinde kaldırıldı.
// =====================================================================
const DISCORD_CONTENT_LIMIT = 2000;
let ebSendInFlight = false;

export function openEngagementBoardSend() {
  const period = selectedPeriod();
  if (!period) return;
  document.getElementById("ebSendDesc").textContent = t("ebSendDesc").replace("{period}", periodOptionLabel(period));
  document.getElementById("ebSendMessage").value = "";
  updateEngagementBoardSendCounter();
  setEngagementBoardSending(false);
  document.getElementById("engagementBoardSendOverlay").classList.add("active");
  document.getElementById("ebSendMessage").focus();
}

export function closeEngagementBoardSend() {
  if (ebSendInFlight) return; // gönderim sürerken pencere kapanıp sonuç kaybolmasın
  document.getElementById("engagementBoardSendOverlay").classList.remove("active");
}

export function updateEngagementBoardSendCounter() {
  const length = document.getElementById("ebSendMessage").value.length;
  document.getElementById("ebSendCounter").textContent = `${length} / ${DISCORD_CONTENT_LIMIT}`;
}

function setEngagementBoardSending(sending) {
  ebSendInFlight = sending;
  const button = document.getElementById("ebSendSubmit");
  button.disabled = sending;
  button.textContent = sending ? t("ebSending") : t("ebSendSubmit");
}

export async function sendEngagementBoardToDiscord() {
  if (ebSendInFlight) return;
  const period = selectedPeriod();
  if (!period) return;
  const message = document.getElementById("ebSendMessage").value.trim();
  if (message.length > DISCORD_CONTENT_LIMIT) return;
  if (!confirm(t("ebSendConfirm"))) return;

  setEngagementBoardSending(true);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData && sessionData.session ? sessionData.session.access_token : "";
    const res = await fetch("/api/send-engagement-board", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ periodId: period.id, message })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      console.error("[engagement] Discord'a gönderilemedi:", body);
      alert((body && (body.error || body.detail)) || "Error");
      return;
    }
    // Mesaj Discord'a ÇIKTI — kayıt düşerse bile "hata" gösterilmez, yoksa admin tekrar basıp ikinci bir mesaj atabilir.
    try {
      await logActivity("sent", "engagement_period", period.id, { name: periodOptionLabel(period) }, state.currentAdminUsername);
    } catch (logError) {
      console.error(logError);
    }
    setEngagementBoardSending(false);
    closeEngagementBoardSend();
    showToast(t("toastEbSent"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  } finally {
    setEngagementBoardSending(false);
  }
}

/** "⚙️" ile açılan, panonun 3 orta dilim eşiğini (100 ve 0 sabit) elle değiştirmeyi sağlayan küçük ayar modalı. */
export function openEngagementBoardSettings() {
  const [t2, t3, t4] = state.engagementBoardTiers;
  document.getElementById("ebSetting2").value = t2;
  document.getElementById("ebSetting3").value = t3;
  document.getElementById("ebSetting4").value = t4;
  document.getElementById("engagementBoardSettingsOverlay").classList.add("active");
}

export function closeEngagementBoardSettings() {
  document.getElementById("engagementBoardSettingsOverlay").classList.remove("active");
}

export async function saveEngagementBoardTiers() {
  const t2 = Number(document.getElementById("ebSetting2").value);
  const t3 = Number(document.getElementById("ebSetting3").value);
  const t4 = Number(document.getElementById("ebSetting4").value);
  const allIntegers = [t2, t3, t4].every((n) => Number.isInteger(n) && n >= 1 && n <= 99);
  if (!allIntegers || !(t2 > t3 && t3 > t4)) {
    showToast(t("ebInvalidTiers"));
    return;
  }
  try {
    await dbSetSetting("engagementBoardTiers", [t2, t3, t4]);
    state.engagementBoardTiers = [t2, t3, t4];
    closeEngagementBoardSettings();
    openEngagementBoardModal();
    showToast(t("ebTiersSaved"));
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
}

/**
 * Panoyu Discord'a gidenle aynı boyutta (1137x1383, 2x) tek bir JPEG olarak
 * indirir — panel/index.html'de CDN'den yüklenen html2canvas'ı kullanır.
 * Modalda pano transform:scale ile küçültülmüş olduğundan, html2canvas'ın
 * `onclone` kancasıyla SADECE kendi görünmez kopyasında ölçeği ve modalın
 * yükseklik sınırını kaldırıp panoyu tam boyutuyla yakalıyoruz.
 */
export async function downloadEngagementBoardImage() {
  const board = document.querySelector("#engagementBoardBody .ebx");
  if (typeof html2canvas !== "function" || !board) {
    showToast("Error");
    return;
  }
  try {
    const canvas = await html2canvas(board, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      onclone: (clonedDoc) => {
        const clonedScaler = clonedDoc.getElementById("engagementBoardScaler");
        const clonedBody = clonedDoc.getElementById("engagementBoardBody");
        if (clonedScaler) clonedScaler.style.transform = "none";
        if (clonedBody) { clonedBody.style.maxHeight = "none"; clonedBody.style.overflow = "visible"; }
      }
    });
    const link = document.createElement("a");
    link.download = t("engagementBoardFileName") + ".jpg";
    link.href = canvas.toDataURL("image/jpeg", 0.9);
    link.click();
  } catch (error) {
    console.error(error);
    showToast("Error");
  }
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
  const kodGvgWeeks = periodWeeks(state.kodgvg, period);

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
          <th>KOD - GVG</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td>${rowNumHtml(index)}<span class="rank-badge ${rankClass(row.member.rank)}" style="font-size:11px;padding:2px 8px;">${row.member.rank}</span></td>
            <td class="member-name">${escapeHtml(row.member.name)}</td>
            <td class="num-cell" style="font-weight:700; color:var(--cyan-ink);">${row.total}</td>
            <td>${periodWeekChips(state.svs, row.member, svsWeeks, isSvsPoint)}</td>
            <td>${periodWeekChips(state.ss, row.member, ssWeeks, isSsPoint, isSsApplicable)}</td>
            <td>${periodWeekChips(state.kod, row.member, kodWeeks, isKodPoint)}</td>
            <td>${periodWeekChips(state.gvg, row.member, gvgWeeks, isGvgPoint)}</td>
            <td>${periodWeekChips(state.kodgvg, row.member, kodGvgWeeks, isKodGvgPoint)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  document.getElementById("overallReportOverlay").classList.add("active");
}

registerRenderer(renderEngagement);
