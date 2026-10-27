// =====================================================================
// EXC PANELİ — api/ai-chat.js
// =====================================================================
// Admin-only "AI Asistan" sohbet ekranı için sunucu tarafı Gemini proxy'si.
// Mesaj geçmişinin KENDİSİ (ai_chat_messages tablosu) doğrudan tarayıcıdan,
// admin'in kendi Supabase oturumuyla (RLS: author_id = auth.uid()) okunup
// yazılıyor (bkz. js/database.js) — bu fonksiyonun hiçbir veritabanı
// yazması yoktur, SADECE Gemini'ye soruyu iletip cevabı döndürür.
//
// Yetki kontrolü: read-screenshot.js'teki AYNI desen — istek, panelde
// oturum açmış kullanıcının Supabase access token'ını taşımalı, bu token
// current_user_role() RPC'si ile doğrulanır ve sadece "admin" kabul edilir.
// =====================================================================

const { sendChatMessage } = require("./_lib/aiChat");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";

// Her istekte Gemini'ye gönderilen geçmiş bununla sınırlanır (maliyet/bağlam
// boyutu kontrolü) — panelde gösterilen/saklanan geçmiş bundan daha uzun olabilir.
const MAX_HISTORY = 20;

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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    if (!(await verifyAdmin(token))) {
      res.status(403).json({ error: "Bu işlem için yönetici oturumu gerekli." });
      return;
    }

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_HISTORY);
    if (!history.length) {
      res.status(400).json({ error: "Mesaj geçmişi boş." });
      return;
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      res.status(500).json({ error: "AI servisi yapılandırılmamış (GEMINI_API_KEY eksik)." });
      return;
    }

    const reply = await sendChatMessage({ history, geminiApiKey });
    res.status(200).json({ reply });
  } catch (error) {
    console.error("[ai-chat] Beklenmeyen hata:", error);
    res.status(500).json({ error: error.message || "Beklenmeyen bir hata oluştu." });
  }
};
