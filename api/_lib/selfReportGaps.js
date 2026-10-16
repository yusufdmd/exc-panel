// =====================================================================
// EXC PANELİ — api/_lib/selfReportGaps.js
// =====================================================================
// Bir etkinlik türü için "bu haftanın en güncel haftasında" ne elle bir
// kayıt YAZILMIŞ ne de onaylanmış/bekleyen bir Discord self-report'u
// olan, aktif + Discord'u bağlı üyeleri bulur. api/cron-reminder.js
// (günlük hatırlatma DM'i) bunu kullanır.
//
// "Bu hafta" tanımı, api/discord-interactions.js'teki ile AYNI (o
// etkinlik türünün en güncel/en yeni tarihli haftası) — tutarlılık için.
// =====================================================================

const { sbFetchAll, sbFetch } = require("./supabaseAdmin");

/**
 * Bir üye, verilen haftada henüz loncaya katılmamış (veya hesabı henüz
 * devralmamış) olması nedeniyle o haftadan muaf mı? js/ui.js -> isExempt
 * ile AYNI kural, sunucu tarafında (CommonJS) elle tutulan kopyası -
 * yoksa yeni katılan bir üyeye kendisinden ÖNCEKİ haftalar için de
 * yanlışlıkla hatırlatma DM'i gider.
 */
function isExempt(member, week) {
  if (!week || !week.date || !member) return false;
  const threshold = member.user_changed_at || member.joined_at;
  if (!threshold) return false;
  return week.date < String(threshold).slice(0, 10);
}

// SVS/KoD/Diğer'de bir hafta açıldığında her üyeye status="unknown" ile
// GERÇEK bir veritabanı satırı oluşuyor (bkz. js/events.js -> renderEntryRows) -
// bu "veri girilmedi" demek, "satır var" demek değil; aksi halde kimse hiç
// DM almazdı çünkü herkesin zaten (boş) bir satırı vardır. GVG/KoD-GVG/SS'de
// böyle bir sentinel yok, o yüzden onlarda herhangi bir satırın varlığı
// "veri girilmiş" sayılmaya devam ediyor - bilinen bir sınır (bkz. js/
// selfReports.js -> hasRealData, tarayıcı tarafındaki AYNI kopya).
const STATUS_TYPES = new Set(["svs", "kod", "other"]);

/** `{ week, missing: [{ memberId, name, discordId }] }` döner - aktif haftaya hiç ulaşılamıyorsa week=null, missing=[]. */
async function findMissingMembers(type) {
  const weeks = await sbFetch(`${type}_weeks?select=id,week_date&order=week_date.desc&limit=1`);
  const week = weeks[0] || null;
  if (!week) return { week: null, missing: [] };

  const recordSelect = STATUS_TYPES.has(type) ? "member_id,status" : "member_id";
  const [members, discordLinks, records, submissions] = await Promise.all([
    sbFetchAll("members?select=id,name,is_old,is_migrated,joined_at,user_changed_at"),
    sbFetchAll("member_discord_ids?select=member_id,discord_id"),
    sbFetchAll(`${type}_records?week_id=eq.${week.id}&select=${recordSelect}`),
    sbFetchAll(`self_report_submissions?event_type=eq.${type}&week_id=eq.${week.id}&status=in.(pending,approved)&select=member_id`)
  ]);

  const discordByMember = new Map(discordLinks.map((d) => [d.member_id, d.discord_id]));
  const realRecords = STATUS_TYPES.has(type) ? records.filter((r) => r.status && r.status !== "unknown") : records;
  const coveredMemberIds = new Set([...realRecords.map((r) => r.member_id), ...submissions.map((s) => s.member_id)]);

  const missing = members
    .filter((m) => !m.is_old && !m.is_migrated)
    .filter((m) => !isExempt(m, week))
    .filter((m) => discordByMember.has(m.id))
    .filter((m) => !coveredMemberIds.has(m.id))
    .map((m) => ({ memberId: m.id, name: m.name, discordId: discordByMember.get(m.id) }));

  return { week, missing };
}

module.exports = { findMissingMembers };
