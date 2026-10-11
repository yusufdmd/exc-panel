// =====================================================================
// EXC PANELİ — api/_lib/engagementScoring.js
// =====================================================================
// js/engagement.js'teki puanlama mantığının (isSvsPoint/isSsPoint/
// isKodPoint/isGvgPoint, categoryStat, computeEngagementRow, periodWeeks,
// isExempt, aktif üye filtresi, dilim/tier hesaplama) SUNUCU TARAFI
// (CommonJS, tarayıcı/DOM olmadan) birebir kopyası — api/send-engagement-
// board.js'in, kimse panele giriş yapmadan, Katılım Panosu'nu kendi
// başına üretebilmesi için.
//
// ÖNEMLİ: Bu dosya js/engagement.js + js/ui.js (isExempt, statusOf) +
// js/members.js (activeMembers) içindeki KURALLARIN bir kopyasıdır,
// paylaşılan tek bir kaynak DEĞİLDİR (proje hiç build adımı kullanmıyor,
// tarayıcı ES modülleri ile bu CommonJS sunucu fonksiyonu arasında kod
// paylaşımı yok). Puanlama kuralı ileride değişirse (ör. yeni bir etkinlik
// türü eklenirse, ya da SS/GVG eşiği değişirse) BURASI DA elle güncellenmeli
// — aksi halde Discord'a giden rapor, panelin kendi gösterdiğinden sapar.
// =====================================================================

const GVG_GREEN_THRESHOLD = 43500000; // bkz. js/config.js -> GVG_THRESHOLDS.green

const isSvsPoint = (e) => !!e && e.status === "joined";
const isKodPoint = (e) => !!e && e.status === "joined";
const isGvgPoint = (e) => !!e && (Number(e.points) || 0) >= GVG_GREEN_THRESHOLD;
const isSsPoint = (e) => {
  if (!e) return false;
  if (!e.group) return !!(e.appliedSlot1 || e.appliedSlot2 || e.appliedSlot3);
  return !!e.attended;
};

function isExempt(member, week) {
  if (!week || !week.date || !member) return false;
  const threshold = member.userChangedAt || member.joinedAt;
  if (!threshold) return false;
  return week.date < String(threshold).slice(0, 10);
}

function activeMembers(members) {
  return members.filter((m) => !m.isMigrated && !m.isOld);
}

function periodWeeks(weeks, period) {
  if (!period) return [];
  return weeks.filter((w) => w.date && w.date >= period.startDate && (!period.endDate || w.date <= period.endDate));
}

function categoryStat(entries, member, weeks, isPoint) {
  let attended = 0;
  let applicable = 0;
  weeks.forEach((week) => {
    if (isExempt(member, week)) return;
    applicable++;
    const entry = entries.find((e) => e.memberId === member.id && e.weekId === week.id);
    if (isPoint(entry)) attended++;
  });
  return { attended, applicable };
}

/** `stores` = { svs: {weeks, entries}, ss: {...}, kod: {...}, gvg: {...}, kodgvg: {...} } (bkz. mapEventStore). */
function computeEngagementRow(member, period, stores) {
  const svs = categoryStat(stores.svs.entries, member, periodWeeks(stores.svs.weeks, period), isSvsPoint);
  const ss = categoryStat(stores.ss.entries, member, periodWeeks(stores.ss.weeks, period), isSsPoint);
  const kod = categoryStat(stores.kod.entries, member, periodWeeks(stores.kod.weeks, period), isKodPoint);
  const gvg = categoryStat(stores.gvg.entries, member, periodWeeks(stores.gvg.weeks, period), isGvgPoint);
  const kodgvg = categoryStat(stores.kodgvg.entries, member, periodWeeks(stores.kodgvg.weeks, period), isGvgPoint);
  return {
    member: { id: member.id, name: member.name, rank: member.rank },
    total: svs.attended + ss.attended + kod.attended + gvg.attended + kodgvg.attended,
    totalApplicable: svs.applicable + ss.applicable + kod.applicable + gvg.applicable + kodgvg.applicable
  };
}

/** Kapanmış (dondurulmuş) bir dönemse saklanan `results`'ı olduğu gibi, aktifse canlı hesaplar — bkz. js/engagement.js -> getRowsForPeriod. */
function getRowsForPeriod(period, members, stores) {
  if (period.results) return period.results;
  return activeMembers(members).map((member) => computeEngagementRow(member, period, stores));
}

/** 100/t2/t3/t4/0 dilim sınırları + renkleri — bkz. js/engagement.js -> buildEngagementBoardTiers (CSS var() yerine burada sabit hex renkler kullanılır, bkz. css/style.css). */
function buildTierDefs(tiers) {
  const [t2, t3, t4] = tiers;
  return [
    { min: 100, label: `100%`, color: "#E0A63A" },  // --gold
    { min: t2, label: `${t2}%+`, color: "#4ADE80" },  // --success
    { min: t3, label: `${t3}%+`, color: "#E8C34A" },  // --warn
    { min: t4, label: `${t4}%+`, color: "#A987E8" },  // --violet
    { min: 0, label: `<${t4}%`, color: "#E5484D" }   // --danger
  ];
}

/** Dönem + ham veriden, görsele basılacak dilim kovalarını üretir: [{min,label,color,members:[{name}]}]. */
function buildEngagementBuckets(period, members, stores, tiers) {
  const rows = getRowsForPeriod(period, members, stores).filter((row) => row.totalApplicable > 0);
  const buckets = buildTierDefs(tiers).map((tier) => ({ ...tier, members: [] }));
  rows.forEach((row) => {
    const pct = (row.total / row.totalApplicable) * 100;
    const tier = buckets.find((b) => pct >= b.min) || buckets[buckets.length - 1];
    tier.members.push(row.member);
  });
  buckets.forEach((tier) => tier.members.sort((a, b) => a.name.localeCompare(b.name)));
  return buckets;
}

/** TANI AMAÇLI: bir üyenin 5 kategorideki applicable/attended dökümünü döner (bkz. send-engagement-board.js ?debug=). */
function debugMemberBreakdown(member, period, stores) {
  return {
    svs: categoryStat(stores.svs.entries, member, periodWeeks(stores.svs.weeks, period), isSvsPoint),
    ss: categoryStat(stores.ss.entries, member, periodWeeks(stores.ss.weeks, period), isSsPoint),
    kod: categoryStat(stores.kod.entries, member, periodWeeks(stores.kod.weeks, period), isKodPoint),
    gvg: categoryStat(stores.gvg.entries, member, periodWeeks(stores.gvg.weeks, period), isGvgPoint),
    kodgvg: categoryStat(stores.kodgvg.entries, member, periodWeeks(stores.kodgvg.weeks, period), isGvgPoint)
  };
}

module.exports = { buildEngagementBuckets, activeMembers, debugMemberBreakdown };
