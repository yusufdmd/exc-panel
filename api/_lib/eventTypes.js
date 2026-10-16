// =====================================================================
// EXC PANELİ — api/_lib/eventTypes.js
// =====================================================================
// Etkinlik türü kodları (svs/ss/kod/gvg/kodgvg) için görüntü etiketleri —
// sunucu tarafındaki birden fazla dosya (discord-interactions.js,
// cron-reminder.js) tarafından paylaşılır. Tarayıcı tarafında AYNI
// etiketler js/selfReports.js'de ayrıca tutulur (ES module <-> CommonJS
// arası gerçek paylaşım yok, bkz. engagementScoring.js'teki NOT).
// =====================================================================

const EVENT_LABELS = { svs: "SVS", ss: "Sandstorm (SS)", kod: "King of Desert (KoD)", gvg: "GVG", kodgvg: "KoD-GVG" };

module.exports = { EVENT_LABELS };
