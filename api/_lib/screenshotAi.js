// =====================================================================
// EXC PANELİ — api/_lib/screenshotAi.js
// =====================================================================
// Ekran görüntüsünü Google Gemini'nin vision destekli modeline yollayıp
// roster'daki hangi üyenin hangi puanı/durumu aldığını yapılandırılmış
// JSON olarak isteyen ortak mantık. Hem admin panelindeki toplu "AI ile
// Doldur" akışı (api/read-screenshot.js) hem de Discord'daki kendi kendine
// katılım bildirme slash komutu (api/discord-interactions.js) BUNU
// kullanır — ikisi de aynı dilde (CommonJS, api/ altında) olduğu için bu
// gerçek paylaşılan kod, engagementScoring.js'teki gibi elle senkron
// tutulan bir kopya DEĞİL.
// =====================================================================

const MAX_IMAGES = 6;

// Ücretsiz kademede her modelin kotası (RPM/RPD) AYRI sayılıyor — bir modele
// takılırsak diğerine geçebiliriz. "Flash Lite" modelleri günde 500 istekle
// (normal Flash'ın 20'sine karşı) en geniş ücretsiz kotaya sahip olduğu için
// önce onlar denenir; GEMINI_MODEL env değişkeni ayarlıysa (ve zaten zincirde
// yoksa) en başa eklenir, zincirin geri kalanı yine de yedek olarak kalır.
const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"];
const GEMINI_MODELS = process.env.GEMINI_MODEL && !DEFAULT_GEMINI_MODELS.includes(process.env.GEMINI_MODEL)
  ? [process.env.GEMINI_MODEL, ...DEFAULT_GEMINI_MODELS]
  : DEFAULT_GEMINI_MODELS;

// SS başvuru saatleri sabit — ekran görüntüsünde slot NUMARASI değil, bu
// saatler yazıyor. Model sadece gördüğü saati birebir kopyalar, slot
// numarasına çevirme işini biz burada kod tarafında yapıyoruz.
const SLOT_TIME_MAP = { "09:00": "1", "18:00": "2", "23:00": "3" };

function parseDataUrl(imageDataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(imageDataUrl || "");
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

// Etkinlik türüne göre, Gemini'den zorlanacak JSON çıktı şeması (OpenAPI alt kümesi).
function buildResponseSchema(type) {
  const memberIdField = { type: "STRING", description: "Roster listesindeki üyenin id alanı (birebir kopyalanmalı, uydurulmamalı)." };
  let itemProps;
  if (type === "gvg" || type === "kodgvg") {
    itemProps = {
      memberId: memberIdField,
      points: { type: "NUMBER", description: "Ekran görüntüsünde bu üye için görünen puan/skor." }
    };
  } else if (type === "kod") {
    itemProps = {
      memberId: memberIdField,
      status: { type: "STRING", enum: ["joined", "absent"], description: "Üye etkinliğe katıldı mı." },
      excused: { type: "BOOLEAN", description: "Görselde mazeretli/izinli olarak işaretliyse true." }
    };
  } else if (type === "ss") {
    itemProps = {
      memberId: memberIdField,
      group: { type: "STRING", enum: ["A", "B"], description: "Üyenin görselde göründüğü grup." },
      attended: { type: "BOOLEAN", description: "Üye katıldı mı." },
      excused: { type: "BOOLEAN", description: "Mazeretli/izinli işaretliyse true." }
    };
  } else if (type === "power") {
    itemProps = {
      memberId: memberIdField,
      power: { type: "NUMBER", description: "Ekran görüntüsünde bu üye için görünen güç (power) değeri, tam sayıya çevrilmiş." }
    };
  } else if (type === "ss_applied") {
    // Ekran görüntüsünde bir slot NUMARASI (1/2/3) YAZMIYOR — sadece saat
    // yazıyor ("Sunucu Zamanı ... 09:00/18:00/23:00"). Modelden bu sırayı
    // kendisinin hesaplamasını istemek (ör. "başlıktaki saate göre 1, 2
    // veya 3") güvenilmez çıktı; bunun yerine sadece gördüğü saati BİREBİR
    // kopyalamasını istiyoruz, saat->slot eşlemesini SLOT_TIME_MAP ile biz
    // kod tarafında sabit ve güvenilir şekilde yapıyoruz.
    itemProps = {
      memberId: memberIdField,
      time: { type: "STRING", enum: Object.keys(SLOT_TIME_MAP), description: "Bu ekran görüntüsünün başlığındaki 'Sunucu Zamanı ... HH:MM' saatinin BİREBİR kopyası (hesaplama yapma, sadece gördüğün saati yaz)." }
    };
  } else {
    // svs / other
    itemProps = {
      memberId: memberIdField,
      status: { type: "STRING", enum: ["joined", "absent"], description: "Üye katıldı mı." },
      points: { type: "NUMBER", description: "Görünen puan (yoksa 0)." },
      excused: { type: "BOOLEAN", description: "Mazeretli/izinli işaretliyse true." }
    };
  }
  return {
    type: "OBJECT",
    properties: {
      results: {
        type: "ARRAY",
        description: "Ekran görüntüsünde net biçimde tanınan, roster'daki bir üyeyle eşleşen her kayıt için bir öğe.",
        items: { type: "OBJECT", properties: itemProps, required: Object.keys(itemProps) }
      },
      unmatched: {
        type: "ARRAY",
        description: "Ekran görüntüsünde görünen ama roster'daki HİÇBİR üyeyle net biçimde eşleştirilemeyen (ör. oyuncu adını değiştirmiş olabilir) her satır için bir öğe — tahmin YÜRÜTME, sadece bildir.",
        items: {
          type: "OBJECT",
          properties: {
            rawName: { type: "STRING", description: "Ekran görüntüsünde göründüğü haliyle oyuncu adı/ID'si (birebir)." },
            details: { type: "STRING", description: "Görülen değerin kısa açıklaması, ör. '12.3M puan' veya 'katıldı, A grubu'." }
          },
          required: ["rawName", "details"]
        }
      }
    },
    required: ["results", "unmatched"]
  };
}

function buildPrompt(type, roster, imageCount) {
  const rosterJson = JSON.stringify(roster);
  const subject = type === "power"
    ? "You are extracting each player's current power/strength level from mobile game roster screenshots."
    : type === "ss_applied"
    ? "You are extracting which time slot(s) each player applied/voted for in a guild event (SandStorm) sign-up. There are 3 possible time slots, each shown on screen as a server time — never as a number."
    : "You are extracting guild-event attendance/score data from mobile game screenshots.";
  const imagesNote = type === "ss_applied"
    ? (imageCount > 1
        ? `You are given ${imageCount} screenshots. IMPORTANT: unlike a typical scrolled list, each screenshot here may show the applicant list for a DIFFERENT time slot — the exact time (e.g. "09:00", "18:00", "23:00") is shown in a "Sunucu Zamanı ..." header on or near the list. Copy that time LITERALLY, per screenshot — do NOT try to compute or guess which ordinal slot (1st/2nd/3rd) it is, just report the time exactly as written. A player appearing in more than one screenshot applied to more than one time — report them once per time (i.e. it's fine for the same memberId to appear multiple times in "results" with a different "time" each time).`
        : "You are given 1 screenshot. Find its \"Sunucu Zamanı ...\" header and copy that time LITERALLY (do not compute an ordinal slot number) to determine which time this applicant list belongs to, then report every player visible in it under that time.")
    : (imageCount > 1
        ? `You are given ${imageCount} screenshots — they are different parts of the SAME list (e.g. scrolled sections), not separate snapshots in time. Combine information across all of them.`
        : "You are given 1 screenshot.");
  return [
    subject,
    type === "power" || type === "ss_applied" ? "" : `Event type: ${type}.`,
    imagesNote,
    "Here is the roster of members currently relevant (JSON array of {id, name, gameId}):",
    rosterJson,
    "",
    "Read the screenshot(s) and match each player you can identify (by in-game name and/or numeric ID) to exactly one roster entry.",
    "Rules:",
    "- Only use \"id\" values copied verbatim from the roster above. Never invent an id.",
    "- If a player in the screenshots does not clearly match any roster member (e.g. their in-game display name changed and it no longer resembles the roster name/ID), do NOT guess or force a match — instead add them to \"unmatched\" with the exact name/ID as shown and a short description of the value seen (points/status/group/power/slot).",
    "- If a roster member is not visible in any screenshot, omit them from both results and unmatched — do not fabricate a value.",
    type === "ss_applied"
      ? "- Do NOT merge a player's entries across different times into one — if they applied to 09:00 and 18:00, that's two separate items in \"results\" (same memberId, time \"09:00\" and time \"18:00\")."
      : "- If the same player appears in more than one screenshot, include them only once (in results or unmatched, not both), using the clearest/most complete reading.",
    "- Numbers in these screenshots are often abbreviated (e.g. \"12.3M\", \"1.2k\") — convert to the full numeric value.",
    "- Respond with JSON matching the given schema only."
  ].filter(Boolean).join("\n");
}

/**
 * `images` = base64 data URL dizisi. `geminiApiKey` çağıranın kendi
 * env değişkenini (GEMINI_API_KEY) okuyup geçirmesi beklenir.
 * Başarılı olursa `{ results, unmatched }` (roster id'si doğrulanmış,
 * ss_applied için slot'a çevrilmiş), olmazsa bir Error fırlatır.
 */
async function readScreenshots({ type, roster, images, geminiApiKey }) {
  if (!Array.isArray(images) || !images.length) throw new Error("Görsel okunamadı.");
  if (images.length > MAX_IMAGES) throw new Error(`En fazla ${MAX_IMAGES} görsel gönderilebilir.`);
  const parsedImages = images.map(parseDataUrl);
  if (parsedImages.some((img) => !img)) throw new Error("Görsel(ler) okunamadı.");

  const responseSchema = buildResponseSchema(type);
  const promptText = buildPrompt(type, roster, parsedImages.length);
  const geminiBody = JSON.stringify({
    contents: [{
      parts: [
        { text: promptText },
        ...parsedImages.map((img) => ({ inline_data: { mime_type: img.mediaType, data: img.data } }))
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema
    }
  });

  // Her model ücretsiz kademede AYRI bir kotaya sahip — biri kotaya takılırsa
  // (429) veya artık sunulmuyorsa (404) ya da geçici olarak aşırı yüklüyse
  // (503), pes etmeden zincirdeki bir sonraki modele geçiyoruz.
  let geminiRes = null;
  for (let mi = 0; mi < GEMINI_MODELS.length; mi++) {
    const model = GEMINI_MODELS[mi];
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    const attemptRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: geminiBody
    });
    if (attemptRes.ok) {
      geminiRes = attemptRes;
      break;
    }
    const errBody = await attemptRes.text().catch(() => "");
    console.error(`[screenshotAi] Gemini error (model ${model}):`, attemptRes.status, errBody);
    const retryableStatus = attemptRes.status === 429 || attemptRes.status === 404 || attemptRes.status === 503;
    if (!retryableStatus || mi === GEMINI_MODELS.length - 1) {
      throw new Error(`AI servisinden yanıt alınamadı (HTTP ${attemptRes.status}, model: ${model}): ${errBody.slice(0, 500)}`);
    }
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = null;
  }
  if (!parsed || !Array.isArray(parsed.results)) {
    console.error("[screenshotAi] Beklenmeyen Gemini yanıtı:", rawText);
    throw new Error("AI yanıtı ayrıştırılamadı.");
  }

  // Roster dışı / uydurulmuş id'lere karşı son bir güvenlik filtresi.
  const validIds = new Set(roster.map((m) => m.id));
  let results = parsed.results.filter((r) => r && validIds.has(r.memberId));
  // ss_applied: modelin birebir kopyaladığı saati ("09:00" vb.) burada,
  // kod tarafında, sabit ve güvenilir bir eşlemeyle slot numarasına
  // ("1"/"2"/"3") çeviriyoruz — istemci hâlâ "slot" alanını bekliyor.
  if (type === "ss_applied") {
    results = results
      .filter((r) => SLOT_TIME_MAP[r.time])
      .map((r) => ({ memberId: r.memberId, slot: SLOT_TIME_MAP[r.time] }));
  }
  const unmatched = Array.isArray(parsed.unmatched)
    ? parsed.unmatched
        .filter((u) => u && u.rawName)
        .slice(0, 100)
        .map((u) => ({ rawName: String(u.rawName).slice(0, 100), details: String(u.details || "").slice(0, 200) }))
    : [];

  return { results, unmatched };
}

module.exports = { readScreenshots, MAX_IMAGES };
