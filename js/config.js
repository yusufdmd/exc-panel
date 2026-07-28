// =====================================================================
// EXC PANELİ — config.js
// =====================================================================
// Kendi Supabase projenizin bilgilerini buraya girin.
// Supabase Dashboard > Project Settings > API sayfasından alabilirsiniz.
// =====================================================================

export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY";

// ---------------------------------------------------------------------
// Rütbe hiyerarşisi — sıralama ve rozetlerde kullanılır.
// ---------------------------------------------------------------------
export const RANK_ORDER = { R5: 5, R4: 4, R3: 3, R2: 2, R1: 1 };
export const RANKS = ["R5", "R4", "R3", "R2", "R1"];

// ---------------------------------------------------------------------
// GVG haftalık puan renklendirme eşikleri.
// ---------------------------------------------------------------------
export const GVG_THRESHOLDS = {
  green: 43500000,   // puan >= bu değer  -> yeşil
  yellow: 13200000   // puan >= bu değer (yeşilin altı) -> sarı, altı -> kırmızı
};

// ---------------------------------------------------------------------
// Kamp seviyesi seçenekleri: 1-30, ardından AOM-1 .. AOM-5
// ---------------------------------------------------------------------
export const CAMP_LEVELS = (() => {
  const levels = [];
  for (let i = 1; i <= 30; i++) levels.push(String(i));
  for (let i = 1; i <= 5; i++) levels.push(`AOM-${i}`);
  return levels;
})();

export function campLevelSortValue(value) {
  if (!value) return 0;
  if (String(value).startsWith("AOM")) {
    return 30 + Number(String(value).split("-")[1] || 0);
  }
  return Number(value) || 0;
}

// ---------------------------------------------------------------------
// Etkinlik türleri — her biri {type}_weeks / {type}_records tablosuna karşılık gelir.
// ---------------------------------------------------------------------
export const EVENT_TYPES = ["gvg", "svs", "ss", "other"];

// ---------------------------------------------------------------------
// Diller
// ---------------------------------------------------------------------
export const LANGUAGES = ["tr", "en", "de", "es", "fr"];
export const DEFAULT_LANGUAGE = "tr";

// ---------------------------------------------------------------------
// Gerçek zamanlı bağlantı kesilirse devreye giren yedek "yoklama" aralığı (ms).
// ---------------------------------------------------------------------
export const POLL_INTERVAL_MS = 12000;
