// GEÇİCİ: En güncel KOD-GVG haftasındaki kayıtları incelemek için
// (hayalet 0 puanlı satırları bulmak). Kullanıldıktan sonra silinecek.
const { sbFetch, sbFetchAll } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const weeks = await sbFetch("kodgvg_weeks?select=id,label,week_date&order=week_date.desc&limit=3");
    const latestWeek = weeks[0];
    if (!latestWeek) {
      res.status(200).json({ ok: true, weeks, note: "Hiç KOD-GVG haftası yok." });
      return;
    }
    const [records, members] = await Promise.all([
      sbFetchAll(`kodgvg_records?week_id=eq.${latestWeek.id}&select=id,member_id,points`),
      sbFetchAll("members?select=id,name,is_old,is_migrated")
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const rows = records.map((r) => {
      const m = memberById.get(r.member_id);
      return { recordId: r.id, memberId: r.member_id, name: m ? m.name : "(bilinmiyor)", points: r.points, isOld: m ? m.is_old : null, isMigrated: m ? m.is_migrated : null };
    }).sort((a, b) => a.points - b.points);
    res.status(200).json({
      ok: true,
      weeks,
      latestWeek,
      totalRecords: records.length,
      zeroPointCount: rows.filter((r) => r.points === 0).length,
      nonZeroCount: rows.filter((r) => r.points !== 0).length,
      rows
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
