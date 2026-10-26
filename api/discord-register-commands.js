// =====================================================================
// EXC PANELİ — api/discord-register-commands.js
// =====================================================================
// Discord'a "/report-participation" ve "/suggest-name" slash komutlarını
// GLOBAL olarak kaydeder (hem sunucuda hem botla DM'de kullanılabilsin diye - guild-scoped
// komutlar DM'de hiç çalışmaz, bkz. Discord docs: "Guild commands don't
// support the BOT_DM interaction context"). TEK SEFERLİK bir kurulum
// adımıdır (komut tanımı değişmediği sürece tekrar çağırmaya gerek yok) -
// normalde kimse tetiklemesin diye CRON_SECRET ile korunur (bkz.
// api/cron-reminder.js'teki aynı desen).
//
// Global kayıt, guild-scoped'un aksine anında değil ~1 saate kadar sürede
// yayılabilir - ilk kayıttan sonra komutun Discord'da görünmesi gecikebilir.
//
// integration_types: [0,1] = hem sunucuya hem kullanıcıya kurulabilir.
// contexts: [0,1,2] = sunucu kanalı (GUILD) + botla DM (BOT_DM) + diğer
// özel kanallar (PRIVATE_CHANNEL) - üçü de açık. Discord Developer Portal'da
// "Installation" sayfasındaki "User Install" + "Guild Install" önkoşulu
// zaten işaretli olmalı (bkz. commit geçmişi).
// =====================================================================

const COMMANDS = [
  {
    name: "report-participation",
    description: "Report this week's event participation with a screenshot",
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [
      {
        name: "event",
        description: "Which event you're reporting for",
        type: 3, // STRING
        required: true,
        // Sadece 3 etkinlik için kendi kendine bildirim isteniyor (kullanıcı talebi) -
        // SS ve GVG kasıtlı olarak yok.
        choices: [
          { name: "SVS", value: "svs" },
          { name: "KOD - SVS (King of Desert)", value: "kod" },
          { name: "KoD-GVG", value: "kodgvg" }
        ]
      },
      {
        name: "screenshot",
        description: "Your result screenshot",
        type: 11, // ATTACHMENT
        required: true
      }
    ]
  },
  {
    name: "suggest-name",
    description: "Suggest a new in-game username for your profile",
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [
      {
        name: "name",
        description: "The username you'd like to switch to",
        type: 3, // STRING
        required: true,
        max_length: 50
      }
    ]
  }
];

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const { DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN } = process.env;
  if (!DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) {
    res.status(500).json({ error: "DISCORD_APPLICATION_ID / DISCORD_GUILD_ID / DISCORD_BOT_TOKEN tanımlı değil." });
    return;
  }

  try {
    // Eski guild-scoped kaydı temizle (boş dizi = "bu sunucuda hiç komut yok") -
    // aksi halde aynı isimde hem guild hem global komut birden görünüp kafa
    // karıştırabilirdi.
    const guildUrl = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`;
    const guildRes = await fetch(guildUrl, {
      method: "PUT",
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([])
    });
    if (!guildRes.ok) {
      const body = await guildRes.json().catch(() => null);
      res.status(502).json({ error: `Discord HTTP ${guildRes.status} (eski guild komutu silinemedi)`, detail: body });
      return;
    }

    const globalUrl = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;
    const discordRes = await fetch(globalUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(COMMANDS)
    });
    const body = await discordRes.json().catch(() => null);
    if (!discordRes.ok) {
      res.status(502).json({ error: `Discord HTTP ${discordRes.status}`, detail: body });
      return;
    }
    res.status(200).json({ ok: true, registered: Array.isArray(body) ? body.map((c) => c.name) : body, note: "Global kayıt yayılması ~1 saate kadar sürebilir." });
  } catch (error) {
    console.error("[discord-register-commands] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu: " + (error && error.message ? error.message : String(error)) });
  }
};
