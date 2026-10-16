// =====================================================================
// EXC PANELİ — api/cron-reminder.js
// =====================================================================
// Vercel Cron tarafından haftalık sabit saatlerde çağrılır (bkz.
// vercel.json -> crons), hangi hatırlatmanın gönderileceği ?event= sorgu
// parametresiyle belirlenir (aynı fonksiyon, farklı zamanlanmış path'ler
// üzerinden birden fazla cron girdisi tarafından paylaşılır).
//
// Güvenlik: CRON_SECRET ortam değişkeni tanımlıysa, Vercel'in cron
// tetiklemelerinde otomatik eklediği "Authorization: Bearer <CRON_SECRET>"
// başlığı doğrulanır — aksi halde bu URL'i bilen HERKES bildirim
// tetikleyebilirdi (bkz. https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
//
// Saatler Türkiye saatine göre (admin'in verdiği bilgi, oyun saati =
// Türkiye saati - 5 saat) UTC'ye çevrilip vercel.json'a yazılmıştır;
// buradaki mesaj metinleri sadece görüntü amaçlıdır, oyun saatini gösterir.
//
// SS her hafta olur (sabit, atlamasız). SVS/KOD("KOD - SVS")/GVG/KOD-GVG
// ise HAFTAAŞIRI (iki haftada bir) oluyor — Vercel Cron'un kendisi
// "iki haftada bir" gibi bir zamanlama desteklemediği için, cron GİNE
// HER HAFTA aynı gün/saatte tetiklenir ama fonksiyon BIWEEKLY_ANCHORS'taki
// "bilinen aktif tarih"e göre bu haftanın gerçekten sırası mı diye kontrol
// edip değilse mesajı atlar (bkz. isActiveBiweek). Anchor tarihleri, o
// cron girdisinin KENDİSİNİN (gvg2/kodgvg2 gibi gece yarısını aşanlar
// dahil) UTC'de fiilen ateşlendiği takvim gününe göre seçilmiştir.
// =====================================================================

const { postToDiscord } = require("./_lib/discord");
const { sendDirectMessage } = require("./_lib/discordBot");
const { findMissingMembers } = require("./_lib/selfReportGaps");
const { EVENT_LABELS } = require("./_lib/eventTypes");

// Her cron tetiklemesi (ör. "ss1"/"ss2" aynı SS haftasının iki ayrı anı),
// kendi self-report etkinlik türüne (svs/ss/kod/gvg/kodgvg) eşlenir —
// bu, o tetiklemede kimlerin hâlâ Discord'dan katılım bildirmediğine
// bakıp onlara AYRICA bir DM atmak için kullanılır (bkz. dosya sonu).
const SELF_REPORT_TYPE = { ss1: "ss", ss2: "ss", svs: "svs", kod: "kod", gvg1: "gvg", gvg2: "gvg", kodgvg1: "kodgvg", kodgvg2: "kodgvg" };

// İngilizce — lonca içi ortak iletişim dili Türkçe değil İngilizce (bkz. kullanıcı talebi).
const MESSAGES = {
  ss1: "⏰ SS event 1st session (game time 09:00–09:40) has ended. Don't forget to enter the data into the panel!",
  ss2: "⏰ SS event 2nd session (game time 18:00–18:40) has ended. Don't forget to enter the data into the panel!",
  svs: "⏰ SVS event is underway (game time ~15:00). You can start collecting the data and entering it into the panel.",
  kod: "⏰ KOD - SVS event is underway (game time ~15:00). You can start collecting the data and entering it into the panel.",
  gvg1: "⏰ GVG is about to end (game time 20:00). Start collecting the data before it resets!",
  gvg2: "⏰ GVG is about to end (game time 23:00). Do one last check and enter the data into the panel!",
  kodgvg1: "⏰ KOD - GVG is about to end (game time 20:00). Start collecting the data before it resets!",
  kodgvg2: "⏰ KOD - GVG is about to end (game time 23:00). Do one last check and enter the data into the panel!"
};

// Her haftaaşırı etkinliğin İLK "aktif" (mesajın gerçekten gönderileceği) takvim
// günü, UTC — bu tarih ve her 14 günde bir tekrarı aktif, aradaki hafta pasif.
// ss1/ss2 kasıtlı olarak burada YOK (her hafta olur, hiç atlanmaz).
const BIWEEKLY_ANCHORS = {
  svs: "2026-09-18",      // Cuma — bu hafta (09-11) YOK, sonraki (09-18) VAR
  kod: "2026-09-12",      // Cumartesi ("KOD - SVS") — bu hafta VAR, sonraki YOK
  gvg1: "2026-09-19",     // Cumartesi 22:00 UTC — bu hafta (09-12) YOK, sonraki (09-19) VAR
  gvg2: "2026-09-20",     // Pazar 01:00 UTC (gece yarısını aşan GVG 2. uyarı, bir gün sonrasına denk gelir)
  kodgvg1: "2026-09-13",  // Pazar 22:00 UTC — bu hafta (09-13) VAR
  kodgvg2: "2026-09-14"   // Pazartesi 01:00 UTC (KOD-GVG 2. uyarının gece yarısını aşan hâli)
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "KOD - GVG" (Pazar) hatırlatmaları tekrar aktif — aynı haftaaşırı kural
// (bkz. BIWEEKLY_ANCHORS) geçerliliğini koruyor. Askıya alınmış bir
// etkinlik olursa buraya eklenir.
const PAUSED_EVENTS = new Set([]);

/** `anchorDateStr` (UTC gece yarısı, "YYYY-MM-DD") ile aynı 14 günlük periyotta mıyız? */
function isActiveBiweek(anchorDateStr) {
  const anchor = Date.parse(anchorDateStr + "T00:00:00Z");
  const diffDays = Math.floor((Date.now() - anchor) / MS_PER_DAY);
  const weeksSinceAnchor = Math.floor(diffDays / 7);
  // JS'in negatif sayılarda (anchor'dan ÖNCEki haftalarda) garip % davranışını düzeltir.
  return ((weeksSinceAnchor % 2) + 2) % 2 === 0;
}

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const event = req.query && req.query.event;
  const message = MESSAGES[event];
  if (!message) {
    res.status(400).json({ error: "Bilinmeyen hatırlatma türü: " + event });
    return;
  }

  // TEST AMAÇLI: ?dmOnly=1 ile çağrılırsa kanala GERÇEK hatırlatma mesajı
  // atılmaz (ve pasif/haftaaşırı kontrolleri atlanır) - sadece aşağıdaki
  // self-report DM taraması çalışır. Şu an Discord'u bağlı tek kişi test
  // eden admin olduğu için bu DM sadece ona gidiyor.
  const dmOnly = req.query && req.query.dmOnly;
  let ok = true, detail = null;
  if (!dmOnly) {
    if (PAUSED_EVENTS.has(event)) {
      res.status(200).json({ ok: true, skipped: true, reason: "paused (KOD/GVG data not being processed right now)" });
      return;
    }

    const anchor = BIWEEKLY_ANCHORS[event];
    if (anchor && !isActiveBiweek(anchor)) {
      res.status(200).json({ ok: true, skipped: true, reason: "off week (biweekly schedule)" });
      return;
    }

    ({ ok, detail } = await postToDiscord(message));
  }

  // Kanal hatırlatmasından SONRA, o etkinlik türü için hâlâ Discord'dan
  // katılım bildirmemiş (ve Discord'u bağlı) üyelere ayrıca bir DM
  // gönderilir. Bu adım başarısız olsa bile ana hatırlatma (yukarıdaki
  // kanal mesajı) etkilenmesin diye ayrı try/catch'te, sessizce loglanır.
  let selfReportDm = null;
  const selfReportType = SELF_REPORT_TYPE[event];
  if (selfReportType && process.env.DISCORD_BOT_TOKEN) {
    try {
      const { week, missing } = await findMissingMembers(selfReportType);
      if (req.query && req.query.debug) {
        const { sbFetchAll } = require("./_lib/supabaseAdmin");
        const discordLinks = await sbFetchAll("member_discord_ids?select=member_id,discord_id");
        const members = await sbFetchAll("members?select=id,name");
        const linkedNames = discordLinks.map((d) => ({ discordId: d.discord_id, name: (members.find((m) => m.id === d.member_id) || {}).name || "?" }));
        res.status(200).json({ week, missingCount: missing.length, missingNames: missing.map((m) => m.name), linkedNames });
        return;
      }
      if (week && missing.length) {
        const label = EVENT_LABELS[selfReportType] || selfReportType;
        const dmText = `⏰ Looks like you haven't reported your ${label} participation yet. Use \`/report-participation\` in the server to send a screenshot!`;
        const results = await Promise.allSettled(missing.map((m) => sendDirectMessage(m.discordId, dmText)));
        const failed = results.filter((r) => r.status === "rejected");
        failed.forEach((r) => console.error("[cron-reminder] self-report DM hatası:", r.reason));
        selfReportDm = { attempted: missing.length, failed: failed.length };
      } else {
        selfReportDm = { attempted: 0, failed: 0 };
      }
    } catch (error) {
      console.error("[cron-reminder] self-report eksik üye taraması hatası:", error);
    }
  }

  res.status(ok ? 200 : 502).json({ ok, detail, selfReportDm });
};
