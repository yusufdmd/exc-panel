// =====================================================================
// EXC PANELİ — api/_lib/aiChat.js
// =====================================================================
// Admin "AI Asistan" sekmesi için serbest formatlı (JSON şemasız) Gemini
// sohbet çağrısı. screenshotAi.js'teki callGemini her zaman bir
// responseSchema zorunlu kılıyor (yapılandırılmış veri çıkarımı için) —
// burada serbest metin istediğimiz için ayrı, daha basit bir istek
// fonksiyonu var. Model-fallback zinciri (GEMINI_MODELS) screenshotAi.js
// ile PAYLAŞILIYOR (gerçek ortak kod — ikisi de aynı dilde/api/ altında).
// =====================================================================

const { GEMINI_MODELS } = require("./screenshotAi");

const SYSTEM_INSTRUCTION = [
  "Sen EXC Paneli'nin (bir Palmon Survival lonca yönetim panelinin) admin ekibi için genel amaçlı bir yardımcı asistansın.",
  "Kısa, net ve doğrudan yanıt ver. Hangi dilde soru sorulursa o dilde cevap ver."
].join(" ");

/**
 * `history` = [{ role: 'user' | 'assistant', content: string }, ...] (en
 * eskiden en yeniye). Başarılı olursa asistanın metin yanıtını döner,
 * olmazsa bir Error fırlatır.
 */
async function sendChatMessage({ history, geminiApiKey }) {
  const contents = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const body = JSON.stringify({
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
  });

  let lastErrBody = "";
  for (let mi = 0; mi < GEMINI_MODELS.length; mi++) {
    const model = GEMINI_MODELS[mi];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("AI yanıtı boş döndü.");
      return text;
    }
    lastErrBody = await res.text().catch(() => "");
    console.error(`[aiChat] Gemini error (model ${model}):`, res.status, lastErrBody);
    const retryable = res.status === 429 || res.status === 404 || res.status === 503;
    if (!retryable || mi === GEMINI_MODELS.length - 1) {
      throw new Error(`AI servisinden yanıt alınamadı (HTTP ${res.status}, model: ${model}): ${lastErrBody.slice(0, 300)}`);
    }
  }
}

module.exports = { sendChatMessage };
