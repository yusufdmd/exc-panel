// GEÇİCİ (tek dosya, her seferinde yeniden yazılır): claimed_element
// sütununun eklendiğini doğrular.
const { sbFetch } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await sbFetch("team_power_suggestions?select=id,claimed_element&limit=1");
    res.status(200).json({ ok: true, columnExists: true, sample: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
