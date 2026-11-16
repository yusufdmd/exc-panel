// GEÇİCİ (tek dosya, her seferinde yeniden yazılır): güvenlik taraması
// sırasında migration_leads'e eklenen test satırını temizler.
const { sbWrite } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await sbWrite("migration_leads?name=eq.__sectest2__", { method: "DELETE" });
  res.status(200).json({ ok: true });
};
