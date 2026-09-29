// =====================================================================
// EXC PANELİ — api/security-check.js
// =====================================================================
// Vercel Cron tarafından günde bir kez çağrılır (bkz. vercel.json -> crons).
// Aşağıdaki SENSITIVE_TABLES listesindeki her tabloya, panelin kullandığı
// AYNI genel (anon) anahtarla ama HİÇ oturum açmadan (Authorization
// başlığı olmadan) bir istek atar — yani tam olarak "hiç giriş yapmamış,
// URL'yi bilen biri" ne görebilirdi diye sorar.
//
// Bu, 2026-09-29'da current_user_role() fonksiyonundaki bir hata yüzünden
// migration_leads ve birkaç başka tablonun tamamen herkese açık kaldığının
// fark edilmesinden sonra eklendi (bkz. sql/add_member_role.sql'deki
// "KRİTİK DÜZELTME" notu) — bir dahaki sefere aynı sınıftan bir hatayı
// (yeni bir SQL değişikliği, yanlışlıkla Supabase Dashboard'dan silinen
// bir politika, vb.) bir kullanıcı bulmadan ÖNCE biz fark edelim diye.
//
// Herhangi bir tablo BOŞ DİZİDEN FARKLI bir şey döndürürse (yani anonim
// bir istekte veri sızıyorsa), DISCORD_WEBHOOK_URL'e acil bir uyarı
// gönderilir. Her şey yolundaysa Discord'a HİÇBİR ŞEY gönderilmez —
// günlük "her şey yolunda" mesajıyla kanalı doldurmamak için (bkz.
// module.exports sonundaki `if (!leaks.length) return`).
// =====================================================================

const { postToDiscord } = require("./_lib/discord");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";

// Bu tabloların HİÇBİRİ anonim (giriş yapmamış) bir isteğe veri döndürmemeli.
// Yeni bir tablo eklenince (yeni bir sql/add_*.sql dosyası) buraya da
// eklenmeli — aksi halde bu kontrol o tabloyu hiç görmez.
const SENSITIVE_TABLES = [
  "members", "power_history", "team_power_history",
  "gvg_weeks", "gvg_records",
  "svs_weeks", "svs_records",
  "ss_weeks", "ss_records",
  "other_weeks", "other_records",
  "kod_weeks", "kod_records",
  "kodgvg_weeks", "kodgvg_records",
  "engagement_periods",
  "migration_periods", "migration_prospects", "migration_leads",
  "name_suggestions", "settings", "users", "activity_logs"
];

/** Tek bir tabloyu anonim olarak sorgular; sızıntı varsa true döner. */
async function checkTable(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY }
    });
    if (!res.ok) return { table, leaked: false }; // 401/403/404 -> beklenen, kilitli
    const data = await res.json().catch(() => null);
    return { table, leaked: Array.isArray(data) && data.length > 0 };
  } catch (error) {
    // Ağ hatası vb. — "sızıntı yok" diye YANLIŞ pozitif vermemek için
    // sızıntı olarak SAYMIYORUZ, ama teşhis için loglanıyor.
    console.error(`[security-check] ${table} kontrol edilemedi:`, error);
    return { table, leaked: false, checkError: true };
  }
}

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const results = await Promise.all(SENSITIVE_TABLES.map(checkTable));
  const leaks = results.filter((r) => r.leaked);
  const checkErrors = results.filter((r) => r.checkError);

  if (leaks.length) {
    const tableList = leaks.map((r) => `\`${r.table}\``).join(", ");
    const message = `🚨🚨🚨 **GÜVENLİK UYARISI** 🚨🚨🚨\nAşağıdaki tablo(lar) şu anda giriş yapılmadan (anonim) okunabiliyor:\n${tableList}\n\nBu, RLS (Row Level Security) politikalarından biri bozulmuş/eksik demektir. Lütfen Yusuf'a hemen haber verin ve Supabase Dashboard > Authentication > Policies'i kontrol edin.`;
    const { ok, detail } = await postToDiscord(message);
    res.status(200).json({ ok: true, leaks: leaks.map((r) => r.table), notified: ok, notifyDetail: detail });
    return;
  }

  res.status(200).json({ ok: true, leaks: [], checkErrors: checkErrors.map((r) => r.table) });
};
