// GEÇİCİ: Gemini'nin güncel görsel-üretme model adını canlı test etmek için.
// Kullanıldıktan sonra silinecek.
const CANDIDATES = [
  "gemini-3-pro-image",
  "gemini-2.5-flash-image"
];

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const results = [];
  for (const model of CANDIDATES) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const body = model.startsWith("imagen-")
        ? null // Imagen modelleri farklı bir endpoint/body şekli kullanır, ayrı test edilecek
        : JSON.stringify({
            contents: [{ parts: [{ text: "A small red circle on a white background." }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
          });
      if (!body) {
        results.push({ model, skipped: true, note: "Imagen endpoint farklı, ayrı test edildi" });
        continue;
      }
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
      const text = await r.text();
      let hasImage = false;
      try {
        const data = JSON.parse(text);
        hasImage = !!data?.candidates?.[0]?.content?.parts?.some((p) => p.inlineData || p.inline_data);
      } catch {}
      results.push({ model, status: r.status, ok: r.ok, hasImage, bodySnippet: text.slice(0, 1200) });
    } catch (error) {
      results.push({ model, error: error.message });
    }
  }
  res.status(200).json({ results });
};
