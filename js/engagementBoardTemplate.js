// =====================================================================
// EXC PANELİ — js/engagementBoardTemplate.js
// =====================================================================
// "Katılım Panosu" görselinin TEK şablonu: images/engagement-board-bg.jpg
// arka planının üstüne, 5 dilim sütununun içine üye isimlerini, sütun
// başlıklarını (eşikler ayarlanabildiği için arka plandakilerin üstüne
// yazılır), başlığı ve etkinlik şeridini yerleştirir.
//
// Hem sunucu (api/send-engagement-board.js, CommonJS require) hem panel
// (panel/index.html'de klasik <script>, window.EngagementBoardTemplate)
// AYNI dosyayı kullanır — Discord'a giden görsel ile paneldeki pano
// birbirinden sapmasın diye.
//
// Tüm koordinatlar arka plan görselinin kendi piksel ölçüsündedir
// (BOARD_WIDTH x BOARD_HEIGHT). Görsel değişirse COLUMNS/HEADERS/TITLE
// koordinatları da güncellenmeli.
// =====================================================================
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EngagementBoardTemplate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const BOARD_WIDTH = 1137;
  const BOARD_HEIGHT = 1383;

  // Her dilim sütununun isim alanı (çerçevenin içi) ve başlık yazısı alanı (iki defne dalının arası).
  // (Alt sınır y≈1124: daha aşağısı sol alttaki maskota ve sağ alttaki kristallere biniyor.)
  const COLUMNS = [
    { body: { x: 42, y: 314, w: 204, h: 810 }, head: { x: 76, y: 244, w: 138, h: 54 }, color: "#FFD15C" },
    { body: { x: 268, y: 314, w: 196, h: 810 }, head: { x: 302, y: 244, w: 136, h: 54 }, color: "#5CF2A6" },
    { body: { x: 486, y: 314, w: 196, h: 810 }, head: { x: 518, y: 244, w: 136, h: 54 }, color: "#FFC94D" },
    { body: { x: 702, y: 314, w: 192, h: 810 }, head: { x: 734, y: 244, w: 132, h: 54 }, color: "#D9B8FF" },
    { body: { x: 918, y: 314, w: 172, h: 810 }, head: { x: 946, y: 244, w: 128, h: 54 }, color: "#FFB3B3" }
  ];

  const EVENTS_LINE = "GVG • KoD-GVG • SVS • King of Desert • Sandstorm";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /**
   * Sütundaki isim sayısına göre satır yüksekliği, yazı boyu ve alt sütun sayısı — isimler hiçbir zaman
   * dikeyde taşmasın diye. 50 kişiye kadar tek sütun (satırlar sıkışır); daha fazlası iki alt sütuna bölünür.
   * Yatayda sığmayan tek tek isimleri fitEngagementBoardNames küçültür.
   */
  function layoutFor(count, body) {
    const usable = body.h - 34; // üstteki "N members" rozeti için pay
    const cols = count > 50 ? 2 : 1;
    const rows = Math.max(1, Math.ceil(count / cols));
    const rowH = Math.max(13, Math.min(30, Math.floor(usable / rows)));
    const font = Math.max(10, Math.min(17, Math.round(rowH * 0.62)));
    return { cols, rowH, font };
  }

  /**
   * Render SONRASI çağrılır (tarayıcıda — panelde doğrudan, sunucuda page.evaluate ile): sütun
   * genişliğine sığmayan her ismin yazı boyunu, sığana kadar (en az 8px) küçültür; o da
   * yetmezse CSS'teki "…" devreye girer. Sunucuda page.evaluate'e kaynak olarak verildiği için
   * dışarıdan hiçbir şeye bağımlı OLMAMALI.
   */
  function fitEngagementBoardNames(root) {
    const COLUMN_MIN = 10; // bir sütunun ortak yazı boyu bunun altına inmez — tek bir aşırı uzun isim tüm sütunu küçültmesin
    const NAME_MIN = 8;    // o aşırı uzun isim tek başına buna kadar küçülebilir, sonrası "…"
    // offsetWidth (getBoundingClientRect değil): panelde pano transform:scale ile küçültülüyor, ölçüm ölçekten etkilenmemeli.
    const fits = (el) => el.firstElementChild.offsetWidth <= el.clientWidth - 8; // 8 = yatay padding
    (root || document).querySelectorAll(".ebx-body").forEach((body) => {
      const names = Array.from(body.querySelectorAll(".ebx-name"));
      if (!names.length) return;
      const base = parseFloat(names[0].style.fontSize) || 14;
      // 1) Sütunun ortak boyu: en uzun ismin sığdığı boy (en az COLUMN_MIN), hepsine birden uygulanır.
      let columnSize = base;
      names.forEach((el) => {
        const ratio = (el.clientWidth - 8) / el.firstElementChild.offsetWidth;
        if (ratio < 1) columnSize = Math.min(columnSize, Math.floor(base * ratio * 2) / 2);
      });
      columnSize = Math.max(COLUMN_MIN, columnSize);
      names.forEach((el) => { el.style.fontSize = columnSize + "px"; });
      // 2) Hâlâ sığmayan tek tük isimler kendi başına küçülür.
      names.forEach((el) => {
        let size = columnSize;
        while (!fits(el) && size > NAME_MIN) {
          size -= 0.5;
          el.style.fontSize = size + "px";
        }
      });
    });
  }

  /**
   * Panonun kendi <style>'ı + işaretlemesi (tam bir HTML belgesi DEĞİL — panel
   * bunu modalın içine koyar, sunucu buildEngagementBoardDocument ile sarar).
   *
   * @param {object} opts
   * @param {string} opts.bgUrl        arka plan görselinin URL'i (sunucuda data: URI)
   * @param {string} opts.fontUrl      fonts/OpenSans-Bold.ttf'in URL'i (sunucuda data: URI) — sunucudaki Chromium'da
   *                                   sadece Open Sans var; panelde de aynısı gömülür ki iki görünüm birebir aynı olsun
   * @param {number[]} opts.tiers      [t2, t3, t4] ayarlanabilir dilim eşikleri (ör. [70, 50, 30])
   * @param {string[][]} opts.columns  5 dilimin isim listeleri, %100'den <t4'e doğru
   * @param {string} [opts.periodLine] en altta gösterilecek dönem bilgisi
   */
  function buildEngagementBoardMarkup(opts) {
    const [t2, t3, t4] = opts.tiers;
    const labels = ["100%", `${t2}%+`, `${t3}%+`, `${t4}%+`, `&lt;${t4}%`];

    const heads = COLUMNS.map((col, i) => `
      <div class="ebx-head" style="left:${col.head.x}px; top:${col.head.y}px; width:${col.head.w}px; height:${col.head.h}px; --c:${col.color};">
        <div class="ebx-head-pct">${labels[i]}</div>
        <div class="ebx-head-sub">Participation</div>
      </div>`).join("");

    const bodies = COLUMNS.map((col, i) => {
      const names = opts.columns[i] || [];
      const { cols, rowH, font } = layoutFor(names.length, col.body);
      const items = names.length
        ? names.map((name) => `<div class="ebx-name" style="height:${rowH}px; line-height:${rowH}px; font-size:${font}px;"><span>${escapeHtml(name)}</span></div>`).join("")
        : `<div class="ebx-empty">—</div>`;
      return `
      <div class="ebx-body" style="left:${col.body.x}px; top:${col.body.y}px; width:${col.body.w}px; height:${col.body.h}px; --c:${col.color};">
        <div class="ebx-count">${names.length} ${names.length === 1 ? "member" : "members"}</div>
        <div class="ebx-names" style="grid-template-columns:repeat(${cols}, minmax(0, 1fr));">${items}</div>
      </div>`;
    }).join("");

    return `<style>
      @font-face { font-family:"EBX Sans"; src:url("${opts.fontUrl}") format("truetype"); font-weight:100 900; font-display:block; }
      .ebx { position:relative; width:${BOARD_WIDTH}px; height:${BOARD_HEIGHT}px; background:#0b1530 center / 100% 100% no-repeat; overflow:hidden;
             font-family:"EBX Sans","Open Sans",Arial,sans-serif; font-weight:700; color:#fff; text-align:center; }
      .ebx * { box-sizing:border-box; }
      .ebx-title { position:absolute; left:372px; top:50px; width:400px; height:112px; border-radius:14px;
             background:radial-gradient(ellipse at 50% 40%, #16348a 0%, #0f2565 60%, #0c1d52 100%);
             box-shadow:0 0 10px 6px #0f2565; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      /* Degrade yazı (background-clip:text) ve filter yerine katmanlı text-shadow: panelin html2canvas ile
         indirdiği görselde de aynı görünsün diye (html2canvas ikisini de desteklemiyor). */
      .ebx-title-line { font-weight:700; line-height:1; letter-spacing:1px; color:#FFD45E;
             text-shadow:0 -1px 0 #fff3c4, 1px 0 0 #6b3500, -1px 0 0 #6b3500, 0 1px 0 #6b3500, 0 2px 0 #6b3500, 0 3px 0 #4a2400,
                         0 5px 8px rgba(0,0,0,.65), 0 0 14px rgba(255,196,70,.45); }
      .ebx-title-line.l1 { font-size:46px; }
      .ebx-title-line.l2 { font-size:40px; margin-top:4px; }
      .ebx-events { position:absolute; left:406px; top:160px; width:332px; height:28px; border-radius:14px;
             background:linear-gradient(180deg, #13307e, #0b1f57); box-shadow:0 0 4px 3px #0d2463;
             font-size:12.5px; font-weight:700; line-height:28px; color:#f3f6ff; white-space:nowrap; letter-spacing:.2px; }
      .ebx-head { position:absolute; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:6px;
             background:#0a0814; box-shadow:0 0 3px 2px #0a0814; } /* tam opak: arka plandaki eski "Participation" yazısı sızmasın */
      .ebx-head-pct { font-size:29px; font-weight:700; line-height:1; color:var(--c); text-shadow:0 0 8px var(--c), 0 2px 0 #000; }
      .ebx-head-sub { font-size:15px; font-weight:700; line-height:1.15; color:#fff; text-shadow:0 1px 2px #000; margin-top:2px; }
      .ebx-body { position:absolute; padding:6px 8px 0; }
      .ebx-count { height:24px; margin:0 auto 8px; width:fit-content; padding:0 12px; border-radius:12px; font-size:12px; font-weight:700; line-height:24px;
             color:#14110a; background:var(--c); box-shadow:0 0 8px var(--c); }
      .ebx-names { display:grid; column-gap:6px; }
      .ebx-name { padding:0 4px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
             border-bottom:1px solid rgba(255,255,255,.09); text-shadow:0 1px 2px rgba(0,0,0,.9); }
      .ebx-empty { font-size:20px; color:rgba(255,255,255,.45); margin-top:10px; }
      .ebx-period { position:absolute; left:50%; transform:translateX(-50%); bottom:14px; padding:5px 18px; border-radius:16px; white-space:nowrap;
             background:rgba(8,16,48,.88); border:1px solid #e0b64a; color:#ffe6a0; font-size:14px; font-weight:700; box-shadow:0 2px 8px rgba(0,0,0,.6); }
    </style>
    <div class="ebx" style="background-image:url('${opts.bgUrl}');">
      <div class="ebx-title"><div class="ebx-title-line l1">PARTICIPATION</div><div class="ebx-title-line l2">BOARD</div></div>
      <div class="ebx-events">${escapeHtml(EVENTS_LINE)}</div>
      ${heads}
      ${bodies}
      ${opts.periodLine ? `<div class="ebx-period">${escapeHtml(opts.periodLine)}</div>` : ""}
    </div>`;
  }

  /** En alttaki dönem satırı, ör. "Period 2 · 2026-10-12 – ongoing" — panel ve sunucu aynı metni üretsin diye burada. */
  function formatPeriodLine(period) {
    if (!period) return "";
    const range = `${period.startDate} – ${period.endDate || "ongoing"}`;
    return period.seq ? `Period ${period.seq} · ${range}` : range;
  }

  /** Sunucu tarafı (headless Chromium) için tam HTML belgesi. */
  function buildEngagementBoardDocument(opts) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0b1530;}</style></head><body>${buildEngagementBoardMarkup(opts)}</body></html>`;
  }

  return { BOARD_WIDTH, BOARD_HEIGHT, buildEngagementBoardMarkup, buildEngagementBoardDocument, fitEngagementBoardNames, formatPeriodLine };
});
