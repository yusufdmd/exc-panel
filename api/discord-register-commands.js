// =====================================================================
// EXC PANELİ — api/discord-register-commands.js
// =====================================================================
// Discord'a "/report-participation" slash komutunu kaydeder. TEK SEFERLİK bir
// kurulum adımıdır (komut tanımı değişmediği sürece tekrar çağırmaya
// gerek yok) - normalde kimse tetiklemesin diye CRON_SECRET ile korunur
// (bkz. api/cron-reminder.js'teki aynı desen). Guild-scoped kayıt
// kullanılır (global kayıttaki ~1 saatlik yayılma gecikmesi olmadan
// anında görünür).
// =====================================================================

const COMMANDS = [
  {
    name: "report-participation",
    description: "Report this week's event participation with a screenshot",
    type: 1, // CHAT_INPUT
    options: [
      {
        name: "event",
        description: "Which event you're reporting for",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "SVS", value: "svs" },
          { name: "Sandstorm (SS)", value: "ss" },
          { name: "King of Desert (KoD)", value: "kod" },
          { name: "GVG", value: "gvg" },
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
    const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`;
    const discordRes = await fetch(url, {
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
    res.status(200).json({ ok: true, registered: Array.isArray(body) ? body.map((c) => c.name) : body });
  } catch (error) {
    console.error("[discord-register-commands] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu: " + (error && error.message ? error.message : String(error)) });
  }
};
