// GEÇİCİ (tek dosya, her seferinde yeniden yazılır): SQL migration'ının
// gerçekten uygulandığını doğrular - discord_id nullable mı, bucket var mı.
const { sbFetch } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    // discord_id nullable mı - test amaçlı, var olan geçerli bir member_id ile
    // bir deneme satırı eklemeyi dene (discord_id'siz), sonra hemen sil.
    const members = await sbFetch("members?select=id&limit=1");
    if (!members.length) { res.status(200).json({ ok: false, note: "Hiç üye yok, test edilemedi." }); return; }
    const testRes = await fetch(`${SUPABASE_URL}/rest/v1/self_report_submissions`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ member_id: members[0].id, event_type: "svs", image_url: "https://example.com/debug-test.png", status: "rejected" })
    });
    const testBody = await testRes.json().catch(() => null);
    let discordIdNullable = testRes.ok;
    let insertedId = testRes.ok && testBody && testBody[0] ? testBody[0].id : null;
    if (insertedId) {
      await fetch(`${SUPABASE_URL}/rest/v1/self_report_submissions?id=eq.${insertedId}`, {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
    }

    const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/self-report-images`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    const bucketExists = bucketRes.ok;

    res.status(200).json({
      ok: true,
      discordIdNullable,
      discordIdTestError: testRes.ok ? null : testBody,
      bucketExists
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
