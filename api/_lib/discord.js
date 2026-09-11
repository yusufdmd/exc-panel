// =====================================================================
// EXC PANELİ — api/_lib/discord.js
// =====================================================================
// Discord webhook'una mesaj göndermek için paylaşılan yardımcı. Dosya adı
// alt çizgiyle başladığı için Vercel bunu bir route olarak YAYINLAMAZ,
// sadece diğer api/ fonksiyonlarının import edebildiği bir modüldür.
// Webhook URL'leri sadece sunucu tarafında (Vercel ortam değişkenleri)
// tutulur, tarayıcıya asla gitmez.
// =====================================================================

/**
 * `{ ok, detail }` döndürür (sadece true/false değil) — Vercel dashboard'una
 * erişimi olmayan biri (bkz. mevcut geliştirme oturumu) bir hata durumunda
 * NEDENİNİ (env var eksik mi, Discord ne döndürdü) API yanıtından
 * görebilsin diye. `detail` asla webhook URL'sinin kendisini içermez.
 *
 * `payload` bir string ise düz metin mesajı ({content}) olarak, bir obje
 * ise (ör. {embeds:[...]}) olduğu gibi gönderilir. `webhookUrl` verilmezse
 * varsayılan DISCORD_WEBHOOK_URL kullanılır — farklı bir kanala (ör. göç
 * bildirimleri) göndermek isteyen çağıranlar kendi env var'ını geçirir.
 */
async function postToDiscord(payload, webhookUrl) {
  const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    return { ok: false, detail: "Discord webhook URL is not set on the server." };
  }
  const body = typeof payload === "string" ? { content: payload } : payload;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { ok: false, detail: `Discord responded ${res.status}: ${errBody.slice(0, 300)}` };
    }
    return { ok: true, detail: null };
  } catch (error) {
    return { ok: false, detail: "Request to Discord threw: " + (error && error.message ? error.message : String(error)) };
  }
}

module.exports = { postToDiscord };
