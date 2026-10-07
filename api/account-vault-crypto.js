// =====================================================================
// EXC PANELİ — api/account-vault-crypto.js
// =====================================================================
// "Hesap Kasası" sekmesindeki şifre alanlarını (oyun şifresi, kurtarma
// e-postası şifresi) şifreler/çözer. Anahtar (ACCOUNT_VAULT_KEY) SADECE
// bu sunucu tarafı fonksiyonda kullanılır, tarayıcıya asla gitmez — bu
// yüzden `account_vault` tablosu (hatta tüm veritabanı) bir şekilde sızsa
// bile şifre alanları okunabilir halde değildir.
//
// Yetki kontrolü: istek, panelde oturum açmış kullanıcının Supabase
// access token'ını (Authorization: Bearer ...) taşımalı; bu token
// current_user_role() RPC'si ile doğrulanır ve sadece "admin" rolü kabul
// edilir (bkz. sql/add_member_role.sql). Anon anahtar tek başına yeterli
// değildir (bkz. read-screenshot.js'teki aynı desen).
//
// AES-256-GCM kullanılır: her değer kendi rastgele IV'siyle şifrelenir,
// IV + authTag + şifreli veri tek bir base64 metin olarak saklanır.
// =====================================================================

const crypto = require("crypto");

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

function getKey() {
  const raw = process.env.ACCOUNT_VAULT_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

function encryptOne(key, plain) {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptOne(key, blob) {
  if (blob == null || blob === "") return null;
  try {
    const buf = Buffer.from(blob, "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (error) {
    console.error("[account-vault-crypto] Çözme hatası:", error);
    return null;
  }
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

    const key = getKey();
    if (!key) {
      res.status(500).json({ error: "Sunucuda ACCOUNT_VAULT_KEY tanımlı değil ya da geçersiz (32 byte base64 olmalı)." });
      return;
    }

    const { action, values } = req.body || {};
    if (action !== "encrypt" && action !== "decrypt") {
      res.status(400).json({ error: "Geçersiz işlem." });
      return;
    }
    if (!Array.isArray(values)) {
      res.status(400).json({ error: "values bir dizi olmalı." });
      return;
    }

    const result = values.map((v) => (action === "encrypt" ? encryptOne(key, v) : decryptOne(key, v)));
    res.status(200).json({ values: result });
  } catch (error) {
    console.error("[account-vault-crypto] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu." });
  }
};
