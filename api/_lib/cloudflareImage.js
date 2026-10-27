// =====================================================================
// EXC PANELİ — api/_lib/cloudflareImage.js
// =====================================================================
// AI Asistan'ın "🎨 Görsel" modu için Cloudflare Workers AI üzerinden
// görsel üretimi (@cf/black-forest-labs/flux-1-schnell). Gemini'nin
// görsel üretimi ücretsiz kademede kota vermediği için seçildi —
// Cloudflare'in günlük 10.000 Neuron'luk ücretsiz kotası kredi kartı
// istemiyor ve bu model için bu kota günde ~150-200 görsele denk geliyor.
// =====================================================================

/** Başarılı olursa `data:image/jpeg;base64,...` döner, olmazsa Error fırlatır. */
async function generateImage({ prompt, accountId, apiToken }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
    // steps: izin verilen azami değer (8) - varsayılan 4'e göre prompt'a biraz
    // daha sadık sonuç verir (ücretsiz günlük kotamızda hâlâ bolca yer kalıyor).
    body: JSON.stringify({ prompt, steps: 8 })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success || !data?.result?.image) {
    const errBody = data ? JSON.stringify(data).slice(0, 500) : await res.text().catch(() => "");
    console.error("[cloudflareImage] Cloudflare error:", res.status, errBody);
    throw new Error(`Görsel oluşturulamadı (HTTP ${res.status}): ${errBody}`);
  }
  return `data:image/jpeg;base64,${data.result.image}`;
}

module.exports = { generateImage };
