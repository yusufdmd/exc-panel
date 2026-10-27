// GEÇİCİ: ai_chat_messages.mode sütununun gerçekten oluştuğunu ve
// PostgREST şemasının yenilendiğini doğrulamak için. Kullanıldıktan
// sonra silinecek.
const { sbFetch } = require("./_lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await sbFetch("ai_chat_messages?select=id,role,mode,created_at&order=created_at.desc&limit=10");
    res.status(200).json({ ok: true, count: rows.length, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
