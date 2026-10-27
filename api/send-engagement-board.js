// =====================================================================
// EXC PANELİ — api/send-engagement-board.js
// =====================================================================
// Vercel Cron tarafından haftalık çağrılır (bkz. vercel.json -> crons).
// Kimse panele giriş yapmadan, Katılım Panosu'nu (aktif dönemin dilim
// sütunlarını) sunucu tarafında bir "görünmez tarayıcı" (headless Chromium,
// @sparticuz/chromium + puppeteer-core) ile görsel olarak üretir ve
// Discord'a bir ek (PNG) olarak gönderir.
//
// Veri, Supabase'in SERVICE ROLE anahtarıyla (RLS'i bypass eder) doğrudan
// çekilir — bu akışta giriş yapmış bir admin yok, normal anon anahtarla
// hiçbir şey okunamazdı. SUPABASE_SERVICE_ROLE_KEY bu yüzden bu projedeki
// EN GÜÇLÜ sır — SADECE bu fonksiyonda kullanılır, asla tarayıcıya gitmez,
// asla loglanmaz. Puanlama kuralları api/_lib/engagementScoring.js'de,
// js/engagement.js'in bir kopyası olarak tutulur (bkz. o dosyadaki NOT).
//
// Güvenlik: CRON_SECRET tanımlıysa (zaten cron-reminder.js'de de olduğu
// gibi), Vercel'in cron tetiklemelerinde eklediği "Authorization: Bearer
// <CRON_SECRET>" doğrulanır — aksi halde bu URL'i bilen HERKES (ağır bir
// işlem olan) bu fonksiyonu tetikleyip Discord'a spam atabilirdi.
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
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil." });
    return;
  }

  let browser = null;
  try {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core")
    ]);

    const [periods, membersRaw, tiersSetting] = await Promise.all([
      sbFetch("engagement_periods?end_date=is.null&select=*&limit=1"),
      sbFetchAll("members?select=id,name,rank,is_old,is_migrated,joined_at,user_changed_at"),
      sbFetch("settings?key=eq.engagementBoardTiers&select=value")
    ]);

    const period = periods[0];
    if (!period) {
      res.status(200).json({ ok: true, skipped: true, reason: "no active engagement period" });
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

    const webhookUrl = process.env.DISCORD_ENGAGEMENT_BOARD_WEBHOOK_URL;
    if (!webhookUrl) {
      res.status(500).json({ error: "Sunucuda DISCORD_ENGAGEMENT_BOARD_WEBHOOK_URL tanımlı değil." });
      return;
    }
    const { ok, detail } = await postToDiscord(
      { content: "" },
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
