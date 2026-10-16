// =====================================================================
// EXC PANELİ — api/discord-interactions.js
// =====================================================================
// Discord'un TÜM slash komut etkileşimleri için POST attığı tek webhook
// hedefi (Discord Developer Portal > Application > General Information >
// "Interactions Endpoint URL"). Proje tamamen sunucusuz olduğu için
// klasik "gateway" botu (7/24 bağlı, DM'leri dinleyen) kurulmuyor —
// bunun yerine Discord'un webhook tabanlı Interactions modeli kullanılır,
// tıpkı diğer tüm Vercel fonksiyonlarımız gibi.
//
// Şu an tek komut: "/report-participation" — bir oyuncu kendi ekran görüntüsünü
// ekleyerek haftalık etkinlik katılımını bildirir. Akış:
//   1) Komutu çalıştıran kişinin Discord ID'si member_discord_ids'te
//      aranır (bkz. sql/move_discord_id_to_admin_table.sql - admin, üye
//      düzenleme formundan elle giriyor; burada SADECE okunuyor).
//   2) Eşleşme yoksa anında bir hata mesajıyla (ephemeral) biter.
//   3) Eşleşme varsa Discord'a "düşünüyorum" (deferred) yanıtı hemen
//      dönülür (Discord'un 3 saniyelik zorunlu yanıt süresi burada
//      karşılanır) - fonksiyon ise AYNI invocation içinde çalışmaya
//      devam eder (Vercel Node fonksiyonlarında res.json() çağrısı
//      işlemi sonlandırmaz, bu modül dönene kadar kod çalışır).
//   4) Ekli görsel indirilip api/_lib/screenshotAi.js (admin panelindeki
//      "AI ile Doldur" ile AYNI, paylaşılan Gemini mantığı) ile okunur.
//   5) Sonuç self_report_submissions'a "pending" olarak yazılır - BURADA
//      hiçbir gerçek katılım kaydına DOKUNULMAZ, sadece bir admin/R4
//      panelden onaylayınca ilgili {type}_records tablosuna işlenir.
//   6) Discord'daki "düşünüyorum" mesajı gerçek bir onay/hata mesajına
//      güncellenir.
//
// Güvenlik: Discord'un gönderdiği HER istek Ed25519 imzasıyla doğrulanır
// (DISCORD_PUBLIC_KEY) - bu olmadan HERKES bu URL'e sahte "komut çalıştı"
// isteği atıp sahte veri enjekte edebilirdi. İmza, isteğin HAM (ham/raw)
// body baytları üzerinden hesaplandığı için Vercel'in otomatik JSON
// parse'ı burada KAPALI (bkz. module.exports.config altta) - body'yi
// kendimiz ham olarak okuyup önce imzayı, sonra JSON'u ayrıştırıyoruz.
// =====================================================================

const { verifyKey, InteractionType, InteractionResponseType, InteractionResponseFlags } = require("discord-interactions");
const { sbFetch, sbWrite } = require("./_lib/supabaseAdmin");
const { readScreenshots } = require("./_lib/screenshotAi");

const EVENT_LABELS = { svs: "SVS", ss: "Sandstorm (SS)", kod: "King of Desert (KoD)", gvg: "GVG", kodgvg: "KoD-GVG" };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function optionsToMap(options) {
  const map = {};
  (options || []).forEach((opt) => { map[opt.name] = opt.value; });
  return map;
}

/** AI'nin okuduğu tek bir sonucu, oyuncuya gösterilecek kısa bir Türkçe özete çevirir. */
function summarizeExtracted(type, extracted) {
  const label = EVENT_LABELS[type] || type;
  if (type === "gvg" || type === "kodgvg") {
    return `✅ ${label} için kaydın alındı: **${Number(extracted.points) || 0} puan**. Bir yöneticinin onayını bekliyor.`;
  }
  if (type === "kod" || type === "svs") {
    const status = extracted.status === "joined" ? "katıldın" : "katılmadın";
    return `✅ ${label} için kaydın alındı: **${status}**. Bir yöneticinin onayını bekliyor.`;
  }
  if (type === "ss") {
    const status = extracted.attended ? "katıldın" : "katılmadın";
    return `✅ ${label} için kaydın alındı: **${status}** (${extracted.group || "grup yok"}). Bir yöneticinin onayını bekliyor.`;
  }
  return `✅ ${label} için kaydın alındı. Bir yöneticinin onayını bekliyor.`;
}

async function patchOriginalMessage(interactionToken, content) {
  const url = `https://discord.com/api/v10/webhooks/${process.env.DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`;
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[discord-interactions] Takip mesajı güncellenemedi: HTTP ${res.status} ${body.slice(0, 500)}`);
    }
  } catch (error) {
    console.error("[discord-interactions] Takip mesajı güncellenemedi (network):", error);
  }
}

async function handleKatilimBildir(interaction, member) {
  const options = optionsToMap(interaction.data.options);
  const type = options.event;
  const attachmentId = options.screenshot;
  const attachment = interaction.data.resolved?.attachments?.[attachmentId];
  const interactionToken = interaction.token;

  try {
    if (!EVENT_LABELS[type] || !attachment) {
      await patchOriginalMessage(interactionToken, "⚠️ İstek eksik görünüyor, lütfen tekrar dener misin?");
      return;
    }

    // TANI: Gemini/DB adımlarına girmeden hemen bir "işleniyor" mesajı
    // dener - bu bile görünmüyorsa sorun patchOriginalMessage/token/app-id
    // tarafında, görünüp sonrası gelmiyorsa sorun Gemini/DB tarafında demektir.
    await patchOriginalMessage(interactionToken, "⏳ Görsel okunuyor, birazdan sonucu paylaşacağım...");

    const imgRes = await fetch(attachment.url);
    if (!imgRes.ok) {
      await patchOriginalMessage(interactionToken, "⚠️ Görsel indirilemedi, lütfen tekrar dener misin?");
      return;
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const dataUrl = `data:${attachment.content_type || "image/png"};base64,${imgBuffer.toString("base64")}`;

    const roster = [{ id: member.id, name: member.name, gameId: member.game_id }];
    const { results } = await readScreenshots({ type, roster, images: [dataUrl], geminiApiKey: process.env.GEMINI_API_KEY });
    const extracted = results.find((r) => r.memberId === member.id) || null;

    const weeks = await sbFetch(`${type}_weeks?select=id,week_date&order=week_date.desc&limit=1`);
    const weekId = weeks[0]?.id || null;

    await sbWrite("self_report_submissions", {
      method: "POST",
      body: {
        member_id: member.id,
        discord_id: interaction.member?.user?.id || interaction.user?.id,
        event_type: type,
        week_id: weekId,
        image_url: attachment.url,
        ai_extracted: extracted,
        ai_unmatched: !extracted
      }
    });

    const message = extracted
      ? summarizeExtracted(type, extracted)
      : "😕 Görselde senin verini net olarak bulamadım. Görseli kontrol edip tekrar dener misin, ya da bir yöneticiyle iletişime geç.";
    await patchOriginalMessage(interactionToken, message);
  } catch (error) {
    console.error("[discord-interactions] /report-participation işlenirken hata:", error);
    await patchOriginalMessage(interactionToken, "⚠️ Beklenmeyen bir hata oluştu, lütfen tekrar dener misin? Sorun devam ederse bir yöneticiye bildir.");
  }
}

const handler = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const isValid = signature && timestamp && await verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);
  if (!isValid) {
    res.status(401).end("Bad request signature");
    return;
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).end("Invalid JSON");
    return;
  }

  if (interaction.type === InteractionType.PING) {
    res.status(200).json({ type: InteractionResponseType.PONG });
    return;
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === "report-participation") {
    const discordUserId = interaction.member?.user?.id || interaction.user?.id;
    const rows = discordUserId && /^\d{17,20}$/.test(discordUserId)
      ? await sbFetch(`member_discord_ids?discord_id=eq.${discordUserId}&select=member_id,members(id,name,game_id,is_old,is_migrated)`).catch(() => [])
      : [];
    const member = rows[0]?.members || null;

    if (!member) {
      res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Discord hesabın henüz profiline kayıtlı değil. Bir yöneticiyle iletişime geçip bağlatabilirsin.", flags: InteractionResponseFlags.EPHEMERAL }
      });
      return;
    }
    if (member.is_old || member.is_migrated) {
      res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Profilin aktif üye listesinde görünmüyor, bu yüzden katılım bildiremezsin. Yanlış olduğunu düşünüyorsan bir yöneticiyle konuş.", flags: InteractionResponseFlags.EPHEMERAL }
      });
      return;
    }

    // Discord'un 3 saniyelik yanıt sınırı burada karşılanıyor; asıl işlem
    // (görsel indirme + AI + DB yazma) bu yanıt dönüldükten SONRA, aynı
    // fonksiyon invocation'ı içinde devam ediyor (bkz. dosya başı NOT).
    res.status(200).json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: InteractionResponseFlags.EPHEMERAL }
    });
    await handleKatilimBildir(interaction, member);
    return;
  }

  res.status(400).end("Unknown interaction");
};

// Discord imza doğrulaması HAM body baytları üzerinden çalışır - Vercel'in
// otomatik JSON parse'ı body'yi tüketip yeniden üretemeyeceğimiz bir
// obje haline getirir, bu yüzden burada kapatılması ŞART.
handler.config = { api: { bodyParser: false } };

module.exports = handler;
