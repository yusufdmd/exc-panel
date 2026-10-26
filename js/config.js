// =====================================================================
// EXC PANELİ — config.js
// =====================================================================
// Kendi Supabase projenizin bilgilerini buraya girin.
// Supabase Dashboard > Project Settings > API sayfasından alabilirsiniz.
// =====================================================================

export const SUPABASE_URL = "https://sbzctjpthorlypfrqgte.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_FNxETjiXZ4tiWqzgyR0vng_vKxGGSp9";

// ---------------------------------------------------------------------
// Rütbe hiyerarşisi — sıralama ve rozetlerde kullanılır.
// ---------------------------------------------------------------------
export const RANK_ORDER = { R5: 5, R4: 4, R3: 3, R2: 2, R1: 1 };
export const RANKS = ["R5", "R4", "R3", "R2", "R1"];

// ---------------------------------------------------------------------
// Aktif üye rütbe kontenjanları — bu sayıya ulaşan rütbeye yeni üye
// eklenemez/taşınamaz (üye ekle/düzenle/eski-üyeden-geri-al akışlarında
// kontrol edilir). Listede olmayan rütbelerin (R3/R2/R1) kontenjanı yoktur.
// ---------------------------------------------------------------------
export const RANK_LIMITS = { R5: 1, R4: 8 };

// ---------------------------------------------------------------------
// GVG / KOD-GVG haftalık puan renklendirme eşikleri. İkisi ayrı eşik
// kullanır çünkü GVG 6 gün, KOD-GVG 7 gün üzerinden hesaplanıyor — ikisi
// de aynı günlük 7.250.000 puan oranına dayanır (6x ve 7x).
// ---------------------------------------------------------------------
export const GVG_THRESHOLDS = {
  gvg: {
    green: 43500000,   // 7.250.000 x 6 gün — puan >= bu değer -> yeşil
    yellow: 13200000   // puan >= bu değer (yeşilin altı) -> sarı, altı -> kırmızı
  },
  kodgvg: {
    green: 50750000,   // 7.250.000 x 7 gün
    yellow: 15400000   // gvg.yellow ile aynı oranda (x 7/6) büyütülmüş
  }
};

// ---------------------------------------------------------------------
// 1. takım elementleri (Palmon Survival'daki dört element).
// ---------------------------------------------------------------------
export const ELEMENTS = ["water", "fire", "earth", "electric"];

// ---------------------------------------------------------------------
// Kamp seviyesi seçenekleri: AOM-5 .. AOM-1, ardından 30 .. 1
// ---------------------------------------------------------------------
export const CAMP_LEVELS = (() => {
  const levels = [];
  for (let i = 5; i >= 1; i--) levels.push(`AOM-${i}`);
  for (let i = 30; i >= 1; i--) levels.push(String(i));
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
export const EVENT_TYPES = ["gvg", "svs", "ss", "kod", "kodgvg", "other"];

// ---------------------------------------------------------------------
// Göç sekmesi — bize katılmak isteyen adayların değer skalası (en
// yüksekten en düşüğe): Altın > Mor > Mavi > Gri.
// ---------------------------------------------------------------------
export const MIGRATION_COLORS = ["gold", "purple", "blue", "gray", "unknown"];
export const MIGRATION_COLOR_ORDER = { gold: 5, purple: 4, blue: 3, gray: 2, unknown: 1 };

// ---------------------------------------------------------------------
// Diller
// ---------------------------------------------------------------------
export const LANGUAGES = ["en", "tr", "de", "es", "fr", "vi"];
export const DEFAULT_LANGUAGE = "en";

// ---------------------------------------------------------------------
// Gerçek zamanlı bağlantı kesilirse devreye giren yedek "yoklama" aralığı (ms).
// ---------------------------------------------------------------------
export const POLL_INTERVAL_MS = 12000;

// ---------------------------------------------------------------------
// Admin girişi kullanıcı adı -> email dönüşümü.
// Supabase Auth teknik olarak bir email adresi bekler ama biz kullanıcıya
// sadece "kullanıcı adı" gösteriyoruz; arka planda "<kullaniciadi>@<bu-domain>"
// adresine çeviriyoruz. Gerçek bir domain olması gerekmez, hiç mail
// gönderilmez (Supabase Dashboard'da admin kullanıcı "Auto Confirm User"
// işaretli oluşturulur). Admin kullanıcı oluştururken email alanına da
// aynı formatı ("kullaniciadi@" + bu değer) girin.
// ---------------------------------------------------------------------
export const ADMIN_LOGIN_DOMAIN = "excpaneli.local";
