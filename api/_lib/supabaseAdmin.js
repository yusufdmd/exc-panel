// =====================================================================
// EXC PANELİ — api/_lib/supabaseAdmin.js
// =====================================================================
// Supabase'e SERVICE ROLE anahtarıyla (RLS'i bypass eder) doğrudan REST
// istekleri atan ortak yardımcılar. Giriş yapmış bir panel kullanıcısı
// olmayan sunucu-tarafı akışlar (haftalık katılım panosu, Discord
// slash komutları) bunu kullanır. SUPABASE_SERVICE_ROLE_KEY asla
// tarayıcıya gitmez, sadece bu tür fonksiyonlarda okunur.
// =====================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";

function authHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Supabase ${path} -> HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res.json();
}

/**
 * PostgREST, limit/offset belirtilmezse bir sorguda VARSAYILAN olarak sadece
 * ilk 1000 satırı döner (bkz. Supabase proje ayarı "db-max-rows") — tablolar
 * büyüdükçe sbFetch() son satırları sessizce atlar (katılım panosunda canlı
 * testte böyle bir kayıp yakalandı, bkz. commit geçmişi). Bu yüzden satır
 * sayısı 1000'i aşabilecek her sorgu (members, haftalık kayıt tabloları vb.)
 * HER ZAMAN bu sayfalanan fonksiyonla, tamamı bitene kadar çekilmeli.
 */
async function sbFetchAll(path) {
  const pageSize = 1000;
  const sep = path.includes("?") ? "&" : "?";
  let offset = 0;
  let all = [];
  for (;;) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${sep}limit=${pageSize}&offset=${offset}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Supabase ${path} -> HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const page = await res.json();
    all = all.concat(page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/** POST/PATCH gibi yazma istekleri için — `Prefer` header'ı (ör. "return=representation") çağıran tarafından verilir. */
async function sbWrite(path, { method = "POST", body, prefer } = {}) {
  const headers = { ...authHeaders(), "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Supabase ${path} -> HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

module.exports = { SUPABASE_URL, sbFetch, sbFetchAll, sbWrite };
