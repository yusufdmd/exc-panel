// =====================================================================
// EXC PANELİ — api/_lib/discord.js
// =====================================================================
// Discord webhook'una mesaj göndermek için paylaşılan yardımcı. Dosya adı
// alt çizgiyle başladığı için Vercel bunu bir route olarak YAYINLAMAZ,
// sadece diğer api/ fonksiyonlarının import edebildiği bir modüldür.
// DISCORD_WEBHOOK_URL sadece sunucu tarafında (Vercel ortam değişkeni)
// tutulur, tarayıcıya asla gitmez.
// =====================================================================

async function postToDiscord(content) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[discord] DISCORD_WEBHOOK_URL sunucuda tanımlı değil.");
    return false;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      console.error("[discord] Webhook isteği başarısız:", res.status, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (error) {
    console.error("[discord] Webhook isteği hata verdi:", error);
    return false;
  }
}

module.exports = { postToDiscord };
