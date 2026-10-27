// GEÇİCİ: Cloudflare görsel üretimini uçtan uca canlı test etmek için.
// Kullanıldıktan sonra silinecek.
const { generateImage } = require("./_lib/cloudflareImage");

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  try {
    const image = await generateImage({
      prompt: "a small golden shield emblem, fantasy guild crest, simple flat icon",
      accountId,
      apiToken
    });
    res.status(200).json({ ok: true, length: image.length, prefix: image.slice(0, 40) });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      hasAccountId: !!accountId,
      accountIdValue: accountId || null,
      hasApiToken: !!apiToken,
      apiTokenLength: apiToken ? apiToken.length : 0,
      apiTokenPrefix: apiToken ? apiToken.slice(0, 6) : null
    });
  }
};
