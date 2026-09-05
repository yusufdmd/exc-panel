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

const MESSAGES = {
  ss1: "⏰ SS etkinliği 1. oturumu (oyun saati 09:00–09:40) sona erdi. Verileri panele işlemeyi unutmayın!",
  ss2: "⏰ SS etkinliği 2. oturumu (oyun saati 18:00–18:40) sona erdi. Verileri panele işlemeyi unutmayın!",
  svs: "⏰ SVS etkinliği devam ediyor (oyun saati ~15:00). Verileri toplayıp panele işlemeye başlayabilirsiniz.",
  kod: "⏰ King of Desert etkinliği devam ediyor (oyun saati ~15:00). Verileri toplayıp panele işlemeye başlayabilirsiniz.",
  gvg1: "⏰ GVG yakında sona eriyor (oyun saati 20:00). Sıfırlanmadan önce verileri toplamaya başlayın!",
  gvg2: "⏰ GVG sona ermek üzere (oyun saati 23:00). Son bir kez verileri kontrol edip panele işleyin!"
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
