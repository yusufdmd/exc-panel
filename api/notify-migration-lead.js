// =====================================================================
// EXC PANELİ — api/notify-migration-lead.js
// =====================================================================
// Genel tanıtım sitesindeki "Göçe Katıl" formu (bkz. js/landing.js ->
// submitLead) başvuruyu migration_leads tablosuna KENDİSİ yazar (herkese
// açık bir Supabase RLS "insert_public" politikasıyla) — bu uç nokta o
// yazmayı YAPMAZ, sadece başvuru başarıyla kaydedildikten SONRA istemcinin
// zaten elinde olan aynı alanlarla çağrılıp göç bildirimleri kanalına
// (DISCORD_MIGRATION_LEAD_WEBHOOK_URL) bir embed (kart) düşürür.
//
// Form giriş yapmamış ziyaretçiler tarafından doldurulduğu için bu uç
// nokta da KASITLI olarak yetkisizdir (bkz. notify-name-suggestion.js'in
// aksine, burada doğrulanacak bir oturum yoktur) — createMigrationLead
// zaten aynı güven seviyesinde herkese açıktır. Discord bildirimi
// gönderilemese bile (env var eksik, Discord hatası vb.) başvurunun
// kendisi zaten kaydedilmiş olduğundan bu uç nokta HER ZAMAN 200 döner;
// tek istisna form tamamen boş/geçersiz gönderilirse 400'dür.
// =====================================================================

const { postToDiscord } = require("./_lib/discord");

const GOLD_ACCENT = 0xE0A63A; // lonca markasıyla aynı altın renk (bkz. css/landing.css --gold)
const ELEMENT_EMOJI = { water: "💧", fire: "🔥", earth: "🪨", electric: "⚡" };

function clean(value, maxLen) {
  if (value == null) return "";
  return String(value).trim().slice(0, maxLen || 200);
}

/** "912400000" -> "912.400.000" (bu projede zaten kullanılan nokta ile binlik ayraç). */
function groupThousands(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const b = req.body || {};
    const name = clean(b.name, 100);
    if (!name) {
      res.status(400).json({ error: "Eksik veri." });
      return;
    }

    const gameId = clean(b.gameId, 20);
    const contact = clean(b.contact, 100);
    const server = clean(b.server, 20);
    const power = clean(b.power, 20);
    const campLevel = clean(b.campLevel, 10);
    const teamPower = clean(b.teamPower, 20);
    const teamElement = clean(b.teamElement, 20);
    const message = clean(b.message, 500);

    const fields = [];
    if (gameId) fields.push({ name: "ID Numarası", value: gameId, inline: true });
    if (contact) fields.push({ name: "İletişim", value: contact, inline: true });
    if (server) fields.push({ name: "Mevcut Sunucu", value: server, inline: true });
    if (power) fields.push({ name: "Toplam Güç Seviyesi", value: groupThousands(power), inline: true });
    if (campLevel) fields.push({ name: "Kamp Seviyesi", value: campLevel, inline: true });
    if (teamPower || teamElement) {
      const emoji = ELEMENT_EMOJI[teamElement] || "";
      fields.push({ name: "1. Takım", value: `${emoji ? emoji + " " : ""}${teamPower ? groupThousands(teamPower) : "—"}`.trim(), inline: true });
    }
    if (message) fields.push({ name: "Mesaj", value: message, inline: false });

    const embed = {
      title: "📥 Yeni Göç Başvurusu",
      description: `**${name}** Excellence'a katılmak için başvurdu.`,
      color: GOLD_ACCENT,
      fields,
      footer: { text: "EXC Paneli • Göç Başvurusu" },
      timestamp: new Date().toISOString()
    };

    const { ok, detail } = await postToDiscord({ embeds: [embed] }, process.env.DISCORD_MIGRATION_LEAD_WEBHOOK_URL);
    if (!ok) console.error("[notify-migration-lead] Discord bildirimi gönderilemedi:", detail);

    // Bildirim başarısız olsa bile başvurunun kendisi zaten kaydedildi — başvuran için hata değildir.
    res.status(200).json({ ok: true, notified: ok });
  } catch (error) {
    console.error("[notify-migration-lead] Beklenmeyen hata:", error);
    res.status(500).json({ error: "Beklenmeyen bir hata oluştu." });
  }
};
