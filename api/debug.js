// Geçici doğrulama ucu — CRON_SECRET ile korunur, iş bitince silinir.
// bkz. memory: tek debug.js dosyasını yeniden kullan, "_debug.js" asla
// (Vercel underscore-prefixli dosyaları route olarak deploy etmiyor).
const { sbFetch } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  try {
    const members = await sbFetch("members?select=id,has_hawk_boss,has_snake_boss&limit=1");
    const suggestions = await sbFetch("team_power_suggestions?select=id,hawk_boss,snake_boss&limit=1");
    res.status(200).json({ ok: true, membersColumnsExist: true, suggestionsColumnsExist: true, membersSample: members, suggestionsSample: suggestions });
  } catch (error) {
    res.status(200).json({ ok: false, error: error.message });
  }
};
