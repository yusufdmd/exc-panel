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

/** `{ week, missing: [{ memberId, name, discordId }] }` döner - aktif haftaya hiç ulaşılamıyorsa week=null, missing=[]. */
async function findMissingMembers(type) {
  const weeks = await sbFetch(`${type}_weeks?select=id,week_date&order=week_date.desc&limit=1`);
  const week = weeks[0] || null;
  if (!week) return { week: null, missing: [] };

  const [members, discordLinks, records, submissions] = await Promise.all([
    sbFetchAll("members?select=id,name,is_old,is_migrated"),
    sbFetchAll("member_discord_ids?select=member_id,discord_id"),
    sbFetchAll(`${type}_records?week_id=eq.${week.id}&select=member_id`),
    sbFetchAll(`self_report_submissions?event_type=eq.${type}&week_id=eq.${week.id}&status=in.(pending,approved)&select=member_id`)
  ]);

  const discordByMember = new Map(discordLinks.map((d) => [d.member_id, d.discord_id]));
  const coveredMemberIds = new Set([...records.map((r) => r.member_id), ...submissions.map((s) => s.member_id)]);

  const missing = members
    .filter((m) => !m.is_old && !m.is_migrated)
    .filter((m) => discordByMember.has(m.id))
    .filter((m) => !coveredMemberIds.has(m.id))
    .map((m) => ({ memberId: m.id, name: m.name, discordId: discordByMember.get(m.id) }));

  return { week, missing };
}

module.exports = { findMissingMembers };
