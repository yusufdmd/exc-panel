// GEÇİCİ (tek dosya, her seferinde yeniden yazılır).
const { sbFetchAll } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await sbFetchAll("self_report_submissions?select=id,member_id,event_type,discord_id,image_url,ai_extracted,ai_unmatched,status,created_at&order=created_at.desc&limit=5");
    res.status(200).json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
