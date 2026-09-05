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
// =====================================================================

const { postToDiscord } = require("./_lib/discord");

// İngilizce — lonca içi ortak iletişim dili Türkçe değil İngilizce (bkz. kullanıcı talebi).
const MESSAGES = {
  ss1: "⏰ SS event 1st session (game time 09:00–09:40) has ended. Don't forget to enter the data into the panel!",
  ss2: "⏰ SS event 2nd session (game time 18:00–18:40) has ended. Don't forget to enter the data into the panel!",
  svs: "⏰ SVS event is underway (game time ~15:00). You can start collecting the data and entering it into the panel.",
  kod: "⏰ King of Desert event is underway (game time ~15:00). You can start collecting the data and entering it into the panel.",
  gvg1: "⏰ GVG is about to end (game time 20:00). Start collecting the data before it resets!",
  gvg2: "⏰ GVG is about to end (game time 23:00). Do one last check and enter the data into the panel!"
};

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

  const ok = await postToDiscord(message);
  res.status(ok ? 200 : 502).json({ ok });
};
