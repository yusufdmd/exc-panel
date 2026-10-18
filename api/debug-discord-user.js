// GEÇİCİ TANI — bir Discord ID'nin geçerli olup olmadığını kontrol eder. Sonra silinecek.
module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  const id = req.query && req.query.id;
  if (!id) { res.status(400).json({ error: "id gerekli" }); return; }
  const r = await fetch(`https://discord.com/api/v10/users/${id}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
  });
  const body = await r.json().catch(() => null);
  res.status(200).json({ status: r.status, body });
};
