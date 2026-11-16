// GEÇİCİ (tek dosya, her seferinde yeniden yazılır): team_power_suggestions
// migration'ının uygulandığını doğrular - discord_id nullable mı.
const { sbFetch, sbWrite } = require("./_lib/supabaseAdmin");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://sbzctjpthorlypfrqgte.supabase.co";

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const members = await sbFetch("members?select=id&limit=1");
    if (!members.length) { res.status(200).json({ ok: false, note: "Hiç üye yok." }); return; }
    const testRes = await fetch(`${SUPABASE_URL}/rest/v1/team_power_suggestions`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ member_id: members[0].id, team_power: 1, team_element: "water", image_url: "https://example.com/debug-test.png", status: "rejected" })
    });
    const testBody = await testRes.json().catch(() => null);
    const discordIdNullable = testRes.ok;
    const insertedId = testRes.ok && testBody && testBody[0] ? testBody[0].id : null;
    if (insertedId) {
      await fetch(`${SUPABASE_URL}/rest/v1/team_power_suggestions?id=eq.${insertedId}`, {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
    }
    res.status(200).json({ ok: true, discordIdNullable, discordIdTestError: testRes.ok ? null : testBody });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
