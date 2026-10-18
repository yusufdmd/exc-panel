// =====================================================================
// EXC PANELİ — api/send-self-report-reminder.js
// =====================================================================
// Panelde "Bu Hafta Eksik Olanlar" listesindeki "📨 Hatırlat" butonuyla
// tetiklenir — o etkinlik türü için hâlâ veri göndermemiş (ve Discord'u
// bağlı) üyelere bir DM atar. Otomatik (cron) DEĞİL, admin'in elle
// başlattığı bir aksiyon - zamanlama/kural konusunda liderlikten dönüş
// beklendiği için bilerek otomatikleştirilmedi (bkz. commit geçmişi).
//
// Yetki: panelde oturum açmış ADMİN'in Supabase access token'ı gerekir
// (bkz. api/read-screenshot.js'teki AYNI verifyAdmin deseni) - CRON_SECRET
// değil, çünkü bu artık cron'dan değil tarayıcıdan tetikleniyor.
// =====================================================================

const { sendDirectMessage } = require("./_lib/discordBot");
const { findMissingMembers } = require("./_lib/selfReportGaps");
const { EVENT_LABELS } = require("./_lib/eventTypes");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";

async function verifyAdmin(token) {
  if (!token) return false;
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_user_role`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: "{}"
  });
  if (!roleRes.ok) return false;
  const role = await roleRes.json().catch(() => null);
  return role === "admin";
}

const VALID_TYPES = new Set(["svs", "kod", "kodgvg"]);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isAdmin = await verifyAdmin(token);
    if (!isAdmin) {
      res.status(403).json({ error: "Bu işlem için yönetici oturumu gerekli." });
      return;
    }

    if (!process.env.DISCORD_BOT_TOKEN) {
      res.status(500).json({ error: "Sunucuda DISCORD_BOT_TOKEN tanımlı değil." });
      return;
    }

    const { type } = req.body || {};
    if (!VALID_TYPES.has(type)) {
      res.status(400).json({ error: "Geçersiz etkinlik türü." });
      return;
    }

    const { week, missing } = await findMissingMembers(type);
    if (!week || !missing.length) {
      res.status(200).json({ ok: true, attempted: 0, failed: 0 });
      return;
    }

    const label = EVENT_LABELS[type] || type;
    const dmText = `⏰ Looks like you haven't reported your ${label} participation yet. Use \`/report-participation\` in the server (or here in DM) to send a screenshot!`;
    const results = await Promise.allSettled(missing.map((m) => sendDirectMessage(m.discordId, dmText)));
    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((r) => console.error("[send-self-report-reminder] DM hatası:", r.reason));

    res.status(200).json({ ok: true, attempted: missing.length, failed: failed.length });
  } catch (error) {
    console.error("[send-self-report-reminder] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu: " + (error && error.message ? error.message : String(error)) });
  }
};
