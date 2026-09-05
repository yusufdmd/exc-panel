// =====================================================================
// EXC PANELİ — api/_lib/discord.js
// =====================================================================
// Discord webhook'una mesaj göndermek için paylaşılan yardımcı. Dosya adı
// alt çizgiyle başladığı için Vercel bunu bir route olarak YAYINLAMAZ,
// sadece diğer api/ fonksiyonlarının import edebildiği bir modüldür.
// DISCORD_WEBHOOK_URL sadece sunucu tarafında (Vercel ortam değişkeni)
// tutulur, tarayıcıya asla gitmez.
// =====================================================================

/**
 * `{ ok, detail }` döndürür (sadece true/false değil) — Vercel dashboard'una
 * erişimi olmayan biri (bkz. mevcut geliştirme oturumu) bir hata durumunda
 * NEDENİNİ (env var eksik mi, Discord ne döndürdü) API yanıtından
 * görebilsin diye. `detail` asla webhook URL'sinin kendisini içermez.
 */
async function postToDiscord(content) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    // Geçici, cerrahi teşhis: değer neden falsy — hiç yok mu, boş string mi,
    // yoksa beklenmeyen bir tür mü? Değerin kendisi asla loglanmaz/dönülmez.
    const keyExists = Object.prototype.hasOwnProperty.call(process.env, "DISCORD_WEBHOOK_URL");
    const relatedKeys = Object.keys(process.env).filter((k) => k.toUpperCase().includes("DISCORD"));
    // Kontrol grubu: kullanıcının aynı yöntemle eklediği TEST_VAR123 de görünmüyorsa,
    // sorun bu değişkene özgü değil — "yeni değişken ekleme" adımının kendisinde demektir.
    const testVarExists = Object.prototype.hasOwnProperty.call(process.env, "TEST_VAR123");
    const testVarValue = process.env.TEST_VAR123;
    return {
      ok: false,
      detail: `DISCORD_WEBHOOK_URL is not set on the server. keyExists=${keyExists}, typeof=${typeof webhookUrl}, length=${webhookUrl ? webhookUrl.length : "n/a"}, relatedEnvKeys=${JSON.stringify(relatedKeys)}, TEST_VAR123_exists=${testVarExists}, TEST_VAR123_value=${JSON.stringify(testVarValue)}, totalEnvVarCount=${Object.keys(process.env).length}`
    };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, detail: `Discord responded ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true, detail: null };
  } catch (error) {
    return { ok: false, detail: "Request to Discord threw: " + (error && error.message ? error.message : String(error)) };
  }
}

module.exports = { postToDiscord };
