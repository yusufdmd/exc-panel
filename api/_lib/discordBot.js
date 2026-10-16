// =====================================================================
// EXC PANELİ — api/_lib/discordBot.js
// =====================================================================
// Discord BOT REST API'siyle (webhook DEĞİL — bir kullanıcıya DM atmak
// webhook ile mümkün değil, bot token gerekir) bir kullanıcıya özel
// mesaj gönderme yardımcısı. DISCORD_BOT_TOKEN sadece bu tür sunucu
// tarafı fonksiyonlarda kullanılır, tarayıcıya asla gitmez.
//
// Gateway (7/24 bağlı) bağlantı GEREKMEZ — DM açmak ve mesaj göndermek
// sade REST istekleri, api/discord-interactions.js'in Interactions
// webhook modeliyle aynı "sunucusuz" mimariye uyuyor.
// =====================================================================

/** Bir kullanıcıyla DM kanalı açar (zaten varsa Discord aynısını döner) ve oraya bir mesaj gönderir. */
async function sendDirectMessage(discordUserId, content) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordUserId })
  });
  if (!dmRes.ok) {
    const body = await dmRes.text().catch(() => "");
    throw new Error(`DM kanalı açılamadı (${discordUserId}): HTTP ${dmRes.status} ${body.slice(0, 300)}`);
  }
  const channel = await dmRes.json();

  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!msgRes.ok) {
    const body = await msgRes.text().catch(() => "");
    throw new Error(`DM gönderilemedi (${discordUserId}): HTTP ${msgRes.status} ${body.slice(0, 300)}`);
  }
}

module.exports = { sendDirectMessage };
