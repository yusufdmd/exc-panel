// GEÇİCİ TANI — readTeamPower()'ı gerçek bir görüntüyle test eder. Sonra silinecek.
const { readTeamPower } = require("./_lib/screenshotAi");

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  try {
    const { image } = req.body || {};
    if (!image) { res.status(400).json({ error: "image gerekli (data URL)" }); return; }
    const result = await readTeamPower({ images: [image], geminiApiKey: process.env.GEMINI_API_KEY });
    res.status(200).json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
