// =====================================================================
// EXC PANELİ — api/read-screenshot.js
// =====================================================================
// Vercel serverless fonksiyonu. Toplu giriş modalındaki "🤖 AI ile
// Doldur" butonu buraya bir veya birden fazla ekran görüntüsü + üye
// listesi (roster) gönderir; asıl Gemini-çağırma mantığı api/_lib/
// screenshotAi.js'de (Discord'daki kendi kendine katılım bildirme
// komutuyla PAYLAŞILAN gerçek kod, kopya değil).
//
// Görsel HİÇBİR YERDE saklanmaz — sadece bu istek boyunca bellekte
// tutulur ve Gemini API'sine iletilir. Anahtar (GEMINI_API_KEY) sadece
// sunucu tarafı fonksiyonlarda kullanılır, tarayıcıya asla gitmez.
//
// Yetki kontrolü: istek, panelde oturum açmış kullanıcının Supabase
// access token'ını (Authorization: Bearer ...) taşımalı; bu token
// current_user_role() RPC'si ile doğrulanır ve sadece "admin" rolü
// kabul edilir (bkz. sql/add_member_role.sql). Anon anahtar tek başına
// yeterli değildir — herkes tarafından bilinir, bu yüzden gerçek
// yetkilendirme burada, token bazında yapılır.
// =====================================================================

const { readScreenshots, MAX_IMAGES } = require("./_lib/screenshotAi");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";

async function verifyAdmin(token) {
  if (!token) return false;
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_user_role`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    },
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
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isAdmin = await verifyAdmin(token);
    if (!isAdmin) {
      res.status(403).json({ error: "Bu işlem için yönetici oturumu gerekli." });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "Sunucuda GEMINI_API_KEY tanımlı değil." });
      return;
    }

    const { type, roster, images } = req.body || {};
    const validTypes = ["gvg", "svs", "ss", "kod", "kodgvg", "other", "power", "ss_applied"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: "Geçersiz etkinlik türü." });
      return;
    }
    if (!Array.isArray(roster) || !roster.length) {
      res.status(400).json({ error: "Üye listesi boş." });
      return;
    }
    if (!Array.isArray(images) || !images.length) {
      res.status(400).json({ error: "Görsel okunamadı." });
      return;
    }
    if (images.length > MAX_IMAGES) {
      res.status(400).json({ error: `En fazla ${MAX_IMAGES} görsel gönderilebilir.` });
      return;
    }

    const { results, unmatched } = await readScreenshots({ type, roster, images, geminiApiKey: process.env.GEMINI_API_KEY });
    res.status(200).json({ results, unmatched });
  } catch (error) {
    console.error("[read-screenshot] Beklenmeyen hata:", error);
    // Teşhis kolaylığı için gerçek hata mesajı da dönülür — bu uç nokta zaten
    // sadece doğrulanmış admin'lere açık, hassas bir bilgi sızdırmıyor.
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu: " + (error && error.message ? error.message : String(error)) });
  }
};
