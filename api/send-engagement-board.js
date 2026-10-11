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
const { buildEngagementBuckets, debugMemberBreakdown } = require("./_lib/engagementScoring");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";

async function sbFetch(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(`Supabase ${path} -> HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res.json();
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
    sbFetch(`${type}_weeks?select=id,week_date`),
    sbFetch(`${type}_records?select=*`)
  ]);
  return { weeks: weeks.map(mapWeek), entries: records.map((r) => mapEntry(type, r)) };
}

/** Dilim kovalarından, tamamen kendi içinde (dış CSS/font'a bağımlı olmadan) bir HTML sayfası üretir. */
function buildBoardHtml(buckets, titleLine, subtitleLine) {
  const columns = buckets.map((tier) => `
    <div class="col" style="--c:${tier.color};">
      <div class="head">${tier.label}<span class="count">${tier.members.length} ${tier.members.length === 1 ? "member" : "members"}</span></div>
      <div class="members">
        ${tier.members.length ? tier.members.map((m) => `<div class="m">${escapeHtmlLite(m.name)}</div>`).join("") : `<div class="empty">—</div>`}
      </div>
    </div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin:0; padding:28px; background:#161B26; font-family: Arial, Helvetica, sans-serif; }
    #board { width: fit-content; }
    .title { color:#E6E9EF; font-size:24px; font-weight:800; letter-spacing:0.5px; margin-bottom:2px; }
    .subtitle { color:#8B94A3; font-size:14px; margin-bottom:18px; }
    .row { display:flex; gap:12px; align-items:flex-start; }
    .col { width:220px; border-radius:14px; border:2px solid var(--c); background:#1E2530; overflow:hidden; }
    .head { background:var(--c); color:#14110a; font-weight:800; text-align:center; padding:12px 8px; font-size:15px; }
    .head .count { display:block; font-size:12px; font-weight:600; opacity:0.72; margin-top:3px; }
    .members { padding:12px 10px; display:flex; flex-direction:column; gap:6px; min-height:40px; }
    .m { font-size:13px; text-align:center; padding:5px 6px; border-radius:7px; background:rgba(255,255,255,0.05); color:#E6E9EF; }
    .empty { font-size:13px; text-align:center; color:#5A6272; }
  </style></head><body>
    <div id="board">
      <div class="title">${escapeHtmlLite(titleLine)}</div>
      <div class="subtitle">${escapeHtmlLite(subtitleLine)}</div>
      <div class="row">${columns}</div>
    </div>
  </body></html>`;
}

function escapeHtmlLite(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
      sbFetch("members?select=id,name,rank,is_old,is_migrated,joined_at,user_changed_at"),
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

    // GEÇİCİ TANI ARACI: ?debug=<üye adı> ile çağrılırsa, Discord'a hiçbir şey
    // göndermeden sadece o üyenin 5 kategorideki applicable/attended dökümünü
    // JSON olarak döner - panelden farklı sonuç çıkan bir üyeyi teşhis etmek için.
    if (req.query && req.query.debug) {
      const needle = String(req.query.debug).toLowerCase();
      const match = members.find((m) => m.name.toLowerCase() === needle) || members.find((m) => m.name.toLowerCase().includes(needle));
      if (!match) { res.status(404).json({ error: "member not found", query: req.query.debug }); return; }
      res.status(200).json({
        member: { name: match.name, isOld: match.isOld, isMigrated: match.isMigrated, joinedAt: match.joinedAt, userChangedAt: match.userChangedAt },
        period: periodApp,
        breakdown: debugMemberBreakdown(match, periodApp, { svs, gvg, ss, kod, kodgvg })
      });
      return;
    }

    const buckets = buildEngagementBuckets(periodApp, members, { svs, gvg, ss, kod, kodgvg }, tiers);

    const dateRange = `${period.start_date} – ongoing`;
    const html = buildBoardHtml(buckets, "🏆 Engagement Challenge — Participation", `${period.seq ? `Period ${period.seq} · ` : ""}${dateRange}`);

    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: { width: 1400, height: 1200 },
      executablePath: await chromium.executablePath(),
      headless: "shell"
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const el = await page.$("#board");
    const pngBuffer = await el.screenshot({ type: "png" });
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
      { buffer: pngBuffer, filename: "engagement-board.png", contentType: "image/png" }
    );
    res.status(ok ? 200 : 502).json({ ok, detail });
  } catch (error) {
    console.error("[send-engagement-board] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu: " + (error && error.message ? error.message : String(error)) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
