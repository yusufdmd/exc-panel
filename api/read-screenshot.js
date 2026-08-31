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
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

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
  return [
    "You are extracting guild-event attendance/score data from mobile game screenshots.",
    `Event type: ${type}.`,
    imageCount > 1
      ? `You are given ${imageCount} screenshots — they are different parts of the SAME leaderboard/list for the same week (e.g. scrolled sections), not separate weeks. Combine information across all of them.`
      : "You are given 1 screenshot.",
    "Here is the roster of members currently relevant for this entry (JSON array of {id, name, gameId}):",
    rosterJson,
    "",
    "Read the screenshot(s) and match each player you can identify (by in-game name and/or numeric ID) to exactly one roster entry.",
    "Rules:",
    "- Only use \"id\" values copied verbatim from the roster above. Never invent an id.",
    "- If a player in the screenshots does not clearly match any roster member (e.g. their in-game display name changed and it no longer resembles the roster name/ID), do NOT guess or force a match — instead add them to \"unmatched\" with the exact name/ID as shown and a short description of the value seen (points/status/group).",
    "- If a roster member is not visible in any screenshot, omit them from both results and unmatched — do not fabricate a value.",
    "- If the same player appears in more than one screenshot, include them only once (in results or unmatched, not both), using the clearest/most complete reading.",
    "- Numbers in these screenshots are often abbreviated (e.g. \"12.3M\", \"1.2k\") — convert to the full numeric value.",
    "- Respond with JSON matching the given schema only."
  ].join("\n");
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
    const validTypes = ["gvg", "svs", "ss", "kod", "other"];
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
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
      })
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => "");
      console.error("[read-screenshot] Gemini error:", geminiRes.status, errBody);
      res.status(502).json({ error: `AI servisinden yanıt alınamadı (HTTP ${geminiRes.status}): ${errBody.slice(0, 500)}` });
      return;
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
