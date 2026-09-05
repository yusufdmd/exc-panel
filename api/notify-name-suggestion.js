// =====================================================================
// EXC PANELİ — api/notify-name-suggestion.js
// =====================================================================
// Bir üye (admin veya viewer) isim değişikliği önerisi gönderdiğinde,
// panel bu uç noktayı çağırıp Discord kanalına bir bildirim düşürür
// (bkz. members.js -> submitNameSuggestion). Herhangi bir doğrulanmış
// oturum (admin YA DA viewer) yeterlidir — read-screenshot.js'in aksine
// burada admin şartı YOKTUR, çünkü bildiri konusu zaten bir viewer'ın
// kendi gönderdiği öneridir.
//
// DISCORD_WEBHOOK_URL sadece bu sunucu tarafı fonksiyonda kullanılır,
// tarayıcıya asla gitmez (bkz. api/_lib/discord.js).
// =====================================================================

const { postToDiscord } = require("./_lib/discord");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";

/** Verilen token'ın geçerli, giriş yapmış BİR kullanıcıya (rol fark etmez) ait olup olmadığını doğrular. */
async function verifyAuthenticated(token) {
  if (!token) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  return res.ok;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isAuthenticated = await verifyAuthenticated(token);
    if (!isAuthenticated) {
      res.status(403).json({ error: "Giriş yapmış bir oturum gerekli." });
      return;
    }

    const { oldName, suggestedName } = req.body || {};
    if (!suggestedName || typeof suggestedName !== "string") {
      res.status(400).json({ error: "Eksik veri." });
      return;
    }

    const safeOld = String(oldName || "?").slice(0, 60);
    const safeNew = suggestedName.slice(0, 60);
    await postToDiscord(`📝 A new name change suggestion came in: **${safeOld}** → **${safeNew}**. Please review and approve it in the panel.`);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[notify-name-suggestion] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu." });
  }
};
