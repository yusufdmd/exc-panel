// =====================================================================
// EXC PANELİ — api/send-engagement-board.js
// =====================================================================
// Panelde "🏆 Katılım Panosu" -> "📣 Discord'a Gönder" ile, ADMİN'in elle
// tetiklediği bir aksiyon (otomatik/cron DEĞİL — liderlik panoyu, kendi
// yazdığı metinle, istediği zaman göndermek istedi). Seçili dönemin dilim
// sütunlarını sunucu tarafında bir "görünmez tarayıcı" (headless Chromium,
// @sparticuz/chromium + puppeteer-core) ile görsele çevirir ve admin'in
// metniyle (mesaj gövdesi) birlikte Discord'a ek olarak gönderir. Görsel
// panelden değil burada üretilir: webhook URL'si tarayıcıya hiç gitmez ve
// her zaman aynı şablonla (js/engagementBoardTemplate.js) çizilir.
//
// Yetki: panelde oturum açmış ADMİN'in Supabase access token'ı gerekir
// (bkz. api/send-self-report-reminder.js'teki AYNI verifyAdmin deseni).
// Veri, Supabase'in SERVICE ROLE anahtarıyla (RLS'i bypass eder) çekilir —
// SUPABASE_SERVICE_ROLE_KEY bu projedeki EN GÜÇLÜ sır, asla tarayıcıya
// gitmez, asla loglanmaz. Puanlama kuralları api/_lib/engagementScoring.js'de,
// js/engagement.js'in bir kopyası olarak tutulur (bkz. o dosyadaki NOT).
//
// Etiketleme: metindeki @everyone/@here/rol/kullanıcı etiketleri BİLEREK
// bildirim gönderir (liderlik kararı) — bkz. allowed_mentions.
// =====================================================================

// @sparticuz/chromium ve puppeteer-core artık SADECE ESM paketleri (package.json'da
// "type": "module") - bu dosya CommonJS olduğu için require() ile yüklenemiyorlar,
// senkron bir ERR_REQUIRE_ESM fırlatıp fonksiyonu try/catch'e bile ulaşmadan çökertir.
// Bu yüzden ikisi de aşağıda, handler içinde dinamik import() ile yükleniyor.
const { postToDiscord } = require("./_lib/discord");
const { buildEngagementBuckets } = require("./_lib/engagementScoring");
const { sbFetch, sbFetchAll } = require("./_lib/supabaseAdmin");
const fs = require("fs");
const path = require("path");
// Panelle ORTAK pano şablonu (bkz. js/engagementBoardTemplate.js) — Discord'a giden görsel ile
// paneldeki "🏆 Katılım Panosu" birebir aynı görünsün diye.
const boardTemplate = require("../js/engagementBoardTemplate.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";
const DISCORD_CONTENT_LIMIT = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Arka plan görseli ve font, sayfaya data: URI olarak gömülür (headless Chromium'un ağdan bir şey
// çekmesine gerek kalmasın diye). Dosyalar vercel.json -> functions -> includeFiles ile pakete eklenir.
function dataUri(relPath, mime) {
  return `data:${mime};base64,${fs.readFileSync(path.join(__dirname, "..", relPath)).toString("base64")}`;
}

function mapMember(row) {
  return { id: row.id, name: row.name, rank: row.rank, isOld: !!row.is_old, isMigrated: !!row.is_migrated, joinedAt: row.joined_at, userChangedAt: row.user_changed_at || null };
}
function mapWeek(row) {
  return { id: row.id, date: row.week_date || "" };
}
function mapEntry(type, row) {
  if (type === "gvg" || type === "kodgvg") return { memberId: row.member_id, weekId: row.week_id, points: row.points };
  if (type === "ss") return { memberId: row.member_id, weekId: row.week_id, group: row.group_name, attended: row.attended, appliedSlot1: !!row.applied_slot_1, appliedSlot2: !!row.applied_slot_2, appliedSlot3: !!row.applied_slot_3 };
  return { memberId: row.member_id, weekId: row.week_id, status: row.status }; // kod/svs
}

async function loadEventStore(type) {
  const [weeks, records] = await Promise.all([
    sbFetchAll(`${type}_weeks?select=id,week_date`),
    sbFetchAll(`${type}_records?select=*`)
  ]);
  return { weeks: weeks.map(mapWeek), entries: records.map((r) => mapEntry(type, r)) };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!(await verifyAdmin(token).catch(() => false))) {
    res.status(403).json({ error: "Bu işlem için yönetici oturumu gerekli." });
    return;
  }

  const { periodId, message } = req.body || {};
  if (typeof periodId !== "string" || !UUID_RE.test(periodId)) {
    res.status(400).json({ error: "Geçersiz dönem." });
    return;
  }
  const content = typeof message === "string" ? message.trim() : "";
  if (content.length > DISCORD_CONTENT_LIMIT) {
    res.status(400).json({ error: `Mesaj en fazla ${DISCORD_CONTENT_LIMIT} karakter olabilir.` });
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil." });
    return;
  }
  const webhookUrl = process.env.DISCORD_ENGAGEMENT_BOARD_WEBHOOK_URL;
  if (!webhookUrl) {
    res.status(500).json({ error: "Sunucuda DISCORD_ENGAGEMENT_BOARD_WEBHOOK_URL tanımlı değil." });
    return;
  }

  let browser = null;
  try {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core")
    ]);

    const [periods, membersRaw, tiersSetting] = await Promise.all([
      sbFetch(`engagement_periods?id=eq.${periodId}&select=*&limit=1`),
      sbFetchAll("members?select=id,name,rank,is_old,is_migrated,joined_at,user_changed_at"),
      sbFetch("settings?key=eq.engagementBoardTiers&select=value")
    ]);

    const period = periods[0];
    if (!period) {
      res.status(404).json({ error: "Dönem bulunamadı." });
      return;
    }

    const [svs, gvg, ss, kod, kodgvg] = await Promise.all([
      loadEventStore("svs"), loadEventStore("gvg"), loadEventStore("ss"), loadEventStore("kod"), loadEventStore("kodgvg")
    ]);
    const members = membersRaw.map(mapMember);
    const tiers = (tiersSetting[0] && Array.isArray(tiersSetting[0].value) && tiersSetting[0].value.length === 3)
      ? tiersSetting[0].value
      : [70, 50, 30];

    const periodApp = { startDate: period.start_date, endDate: period.end_date || null, results: period.results || null };
    const buckets = buildEngagementBuckets(periodApp, members, { svs, gvg, ss, kod, kodgvg }, tiers);

    const html = boardTemplate.buildEngagementBoardDocument({
      bgUrl: dataUri("images/engagement-board-bg.jpg", "image/jpeg"),
      fontUrl: dataUri("fonts/OpenSans-Bold.ttf", "font/ttf"),
      tiers,
      columns: buckets.map((tier) => tier.members.map((m) => m.name)),
      periodLine: boardTemplate.formatPeriodLine({ seq: period.seq, startDate: period.start_date, endDate: period.end_date })
    });

    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      // 2x: isimler ve kodla yazılan başlıklar keskin çıksın (arka plan görseli 1137x1383).
      defaultViewport: { width: boardTemplate.BOARD_WIDTH, height: boardTemplate.BOARD_HEIGHT, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
      headless: "shell"
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(`(${boardTemplate.fitEngagementBoardNames.toString()})()`);
    // JPEG: 2x boyutta, fotoğraf benzeri arka planla PNG ~6 MB olurdu; JPEG %90 ~1-1.5 MB.
    const imageBuffer = await page.screenshot({ type: "jpeg", quality: 90 });
    await browser.close();
    browser = null;

    const { ok, detail } = await postToDiscord(
      // allowed_mentions: metindeki @everyone/@here, rol ve kullanıcı etiketleri bildirim göndersin (bilinçli karar, bkz. dosya başı).
      { content, allowed_mentions: { parse: ["everyone", "roles", "users"] } },
      webhookUrl,
      { buffer: imageBuffer, filename: "engagement-board.jpg", contentType: "image/jpeg" }
    );
    res.status(ok ? 200 : 502).json({ ok, detail });
  } catch (error) {
    console.error("[send-engagement-board] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu: " + (error && error.message ? error.message : String(error)) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
