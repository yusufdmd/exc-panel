// GEÇİCİ: 2026-11-08 ("69-80-89") KOD-GVG haftasındaki hayalet 0 puanlı
// 60 kaydı siler (admin onayı alındı). Kullanıldıktan sonra silinecek.
const { sbWrite } = require("./_lib/supabaseAdmin");

const WEEK_ID = "32257f27-4750-48f2-8de8-c090a7234c2b";

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    // Sadece bu haftanın 0 puanlı satırları - başka hiçbir şeye dokunmaz.
    await sbWrite(`kodgvg_records?week_id=eq.${WEEK_ID}&points=eq.0`, { method: "DELETE" });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
