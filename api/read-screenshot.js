// =====================================================================
// EXC PANELİ — api/read-screenshot.js
// =====================================================================
// Vercel serverless fonksiyonu. Toplu giriş modalındaki "🤖 AI ile
// Doldur" butonu buraya bir veya birden fazla ekran görüntüsü + üye
// listesi (roster) gönderir; bu fonksiyon görüntüleri Google Gemini'nin
// (ücretsiz kotalı) vision destekli modeline yollayıp roster'daki hangi
// üyenin hangi puanı/durumu aldığını yapılandırılmış JSON olarak geri
// ister. Birden fazla görsel (ör. uzun bir listenin farklı kaydırılmış
// bölümleri) tek istekte, aynı haftaya ait parçalar olarak birlikte
// gönderilir.
//
// Görsel HİÇBİR YERDE saklanmaz — sadece bu istek boyunca bellekte
// tutulur ve Gemini API'sine iletilir. Anahtar (GEMINI_API_KEY) sadece
// bu sunucu tarafı fonksiyonda kullanılır, tarayıcıya asla gitmez.
//
// Yetki kontrolü: istek, panelde oturum açmış kullanıcının Supabase
// access token'ını (Authorization: Bearer ...) taşımalı; bu token
// current_user_role() RPC'si ile doğrulanır ve sadece "admin" rolü
// kabul edilir (bkz. sql/add_member_role.sql). Anon anahtar tek başına
// yeterli değildir — herkes tarafından bilinir, bu yüzden gerçek
// yetkilendirme burada, token bazında yapılır.
// =====================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";
// Ücretsiz kademede her modelin kotası (RPM/RPD) AYRI sayılıyor — bir modele
// takılırsak diğerine geçebiliriz. "Flash Lite" modelleri günde 500 istekle
// (normal Flash'ın 20'sine karşı) en geniş ücretsiz kotaya sahip olduğu için
// önce onlar denenir; GEMINI_MODEL env değişkeni ayarlıysa (ve zaten zincirde
// yoksa) en başa eklenir, zincirin geri kalanı yine de yedek olarak kalır.
const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash"];
const GEMINI_MODELS = process.env.GEMINI_MODEL && !DEFAULT_GEMINI_MODELS.includes(process.env.GEMINI_MODEL)
  ? [process.env.GEMINI_MODEL, ...DEFAULT_GEMINI_MODELS]
  : DEFAULT_GEMINI_MODELS;

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

const MAX_IMAGES = 6;

function parseDataUrl(imageDataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(imageDataUrl || "");
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

// Etkinlik türüne göre, Gemini'den zorlanacak JSON çıktı şeması (OpenAPI alt kümesi).
function buildResponseSchema(type) {
  const memberIdField = { type: "STRING", description: "Roster listesindeki üyenin id alanı (birebir kopyalanmalı, uydurulmamalı)." };
  let itemProps;
  if (type === "gvg") {
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
    // Tek istekte BİRDEN FAZLA ekran görüntüsü gönderilebilir, her biri
    // FARKLI bir saat dilimine ait olabilir (görselin kendi üzerinde saat/
    // saat numarası yazar) — bu yüzden hangi slotta olduğu istemciden değil,
    // modelden istenir.
    itemProps = {
      memberId: memberIdField,
      slot: { type: "STRING", enum: ["1", "2", "3"], description: "Bu üyenin göründüğü ekran görüntüsünde belirtilen saat dilimi numarası (başlıkta/etikette yazan saate göre 1, 2 veya 3)." }
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
    ? "You are extracting which time slot(s) each player applied/voted for in a guild event (SandStorm) sign-up. There are 3 possible time slots (1, 2, 3)."
    : "You are extracting guild-event attendance/score data from mobile game screenshots.";
  const imagesNote = type === "ss_applied"
    ? (imageCount > 1
        ? `You are given ${imageCount} screenshots. IMPORTANT: unlike a typical scrolled list, each screenshot here may show the applicant list for a DIFFERENT time slot — the slot number or time (e.g. "1", "09:00", "2", "18:00", "3", "23:00") is usually shown as a header/label on or near the list. Read that label on EACH screenshot separately to determine its slot, then report every player visible in it under that slot. A player appearing in more than one screenshot applied to more than one slot — report them once per slot (i.e. it's fine for the same memberId to appear multiple times in "results" with a different "slot" each time).`
        : "You are given 1 screenshot. Read its slot number/time label (e.g. \"1\", \"09:00\") to determine which slot (1, 2, or 3) this list belongs to, and report every player visible in it under that slot.")
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
      ? "- Do NOT merge a player's entries across different slots into one — if they applied to slots 1 and 2, that's two separate items in \"results\" (same memberId, slot \"1\" and slot \"2\")."
      : "- If the same player appears in more than one screenshot, include them only once (in results or unmatched, not both), using the clearest/most complete reading.",
    "- Numbers in these screenshots are often abbreviated (e.g. \"12.3M\", \"1.2k\") — convert to the full numeric value.",
    "- Respond with JSON matching the given schema only."
  ].filter(Boolean).join("\n");
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
    const validTypes = ["gvg", "svs", "ss", "kod", "other", "power", "ss_applied"];
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
    const parsedImages = images.map(parseDataUrl);
    if (parsedImages.some((img) => !img)) {
      res.status(400).json({ error: "Görsel(ler) okunamadı." });
      return;
    }

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
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
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
      console.error(`[read-screenshot] Gemini error (model ${model}):`, attemptRes.status, errBody);
      const retryableStatus = attemptRes.status === 429 || attemptRes.status === 404 || attemptRes.status === 503;
      if (!retryableStatus || mi === GEMINI_MODELS.length - 1) {
        res.status(502).json({ error: `AI servisinden yanıt alınamadı (HTTP ${attemptRes.status}, model: ${model}): ${errBody.slice(0, 500)}` });
        return;
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
      console.error("[read-screenshot] Beklenmeyen Gemini yanıtı:", rawText);
      res.status(502).json({ error: "AI yanıtı ayrıştırılamadı." });
      return;
    }

    // Roster dışı / uydurulmuş id'lere karşı son bir güvenlik filtresi.
    const validIds = new Set(roster.map((m) => m.id));
    const results = parsed.results.filter((r) => r && validIds.has(r.memberId));
    const unmatched = Array.isArray(parsed.unmatched)
      ? parsed.unmatched
          .filter((u) => u && u.rawName)
          .slice(0, 100)
          .map((u) => ({ rawName: String(u.rawName).slice(0, 100), details: String(u.details || "").slice(0, 200) }))
      : [];

    res.status(200).json({ results, unmatched });
  } catch (error) {
    console.error("[read-screenshot] Beklenmeyen hata:", error);
    // Teşhis kolaylığı için gerçek hata mesajı da dönülür — bu uç nokta zaten
    // sadece doğrulanmış admin'lere açık, hassas bir bilgi sızdırmıyor.
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu: " + (error && error.message ? error.message : String(error)) });
  }
};
