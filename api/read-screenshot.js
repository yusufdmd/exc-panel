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
// current_user_role() RPC'si ile doğrulanır (bkz. sql/add_member_role.sql).
// Anon anahtar tek başına yeterli değildir — herkes tarafından bilinir,
// bu yüzden gerçek yetkilendirme burada, token bazında yapılır.
//
// Üç kullanım şekli var:
//   - admin: toplu giriş modalındaki "AI ile Doldur" - HERHANGİ bir tür,
//     birden fazla görsel, tam roster.
//   - admin: Üyeler sayfasındaki "📸 Takım Gücü Ekle" (bkz.
//     js/teamPowerUpload.js) - type="teamPower", roster YOK, tek görsel -
//     Discord'daki /suggest-team-power ile AYNI readTeamPower() çağrılır.
//   - viewer (panelin paylaşılan girişi): Etkinlikler sekmesindeki
//     "📸 Katılımını Bildir" (site üzerinden kendi kendine katılım
//     bildirme, bkz. js/selfReportUpload.js) - SADECE self-report
//     edilebilir 3 tür (svs/kod/kodgvg), SADECE tek görsel + tek kişilik
//     roster (oyuncu kendi adını zaten seçtiği için AI'nin roster'da
//     isim eşleştirmesi yapmasına hiç gerek yok, sadece değeri okur).
// Bu kısıt olmasa bir viewer bu uç noktayı herhangi bir tür/roster ile
// çağırıp admin'e özel AI kotasını kötüye kullanabilirdi.
// =====================================================================

const { readScreenshots, readTeamPower, MAX_IMAGES } = require("./_lib/screenshotAi");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";
const SELF_REPORTABLE_TYPES = ["svs", "kod", "kodgvg"];

async function verifyRole(token) {
  if (!token) return null;
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_user_role`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    },
    body: "{}"
  });
  if (!roleRes.ok) return null;
  const role = await roleRes.json().catch(() => null);
  return role === "admin" ? "admin" : role === "viewer" ? "viewer" : null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const role = await verifyRole(token);
    if (!role) {
      res.status(403).json({ error: "Bu işlem için panel oturumu gerekli." });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "Sunucuda GEMINI_API_KEY tanımlı değil." });
      return;
    }

    const { type, roster, images } = req.body || {};
    const validTypes = ["gvg", "svs", "ss", "kod", "kodgvg", "other", "power", "ss_applied", "teamPower"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: "Geçersiz etkinlik türü." });
      return;
    }
    // viewer (panelin paylaşılan girişi) sadece kendi kendine katılım
    // bildirme amacıyla, sınırlı şekilde çağırabilir - bkz. dosya başındaki NOT.
    // "teamPower" SELF_REPORTABLE_TYPES'ta olmadığı için viewer için zaten
    // burada reddedilir - Üyeler sayfasındaki "📸 Takım Gücü Ekle" admin-only.
    if (role !== "admin" && (!SELF_REPORTABLE_TYPES.includes(type) || !Array.isArray(roster) || roster.length !== 1)) {
      res.status(403).json({ error: "Bu işlem için yönetici oturumu gerekli." });
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

    // "teamPower" (Üyeler sayfası -> "📸 Takım Gücü Ekle") bir roster ALMAZ -
    // Discord'daki /suggest-team-power ile AYNI readTeamPower() çağrılır,
    // tek görselden sadece {teamPower, teamElement} okunur, isim eşleştirmesi
    // yapılmaz (admin kim olduğunu zaten kendisi seçmiştir).
    if (type === "teamPower") {
      const result = await readTeamPower({ images, geminiApiKey: process.env.GEMINI_API_KEY });
      res.status(200).json(result);
      return;
    }

    if (!Array.isArray(roster) || !roster.length) {
      res.status(400).json({ error: "Üye listesi boş." });
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
