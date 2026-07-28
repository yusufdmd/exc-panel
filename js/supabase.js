// =====================================================================
// EXC PANELİ — supabase.js
// =====================================================================
// Tüm uygulama tarafından paylaşılan tek bir Supabase istemcisi burada
// oluşturulur. Diğer tüm js dosyaları (database.js üzerinden) bu
// istemciyi kullanır.
// =====================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR_PROJECT_REF")) {
  console.warn(
    "[EXC Paneli] SUPABASE_URL ayarlanmamış. js/config.js dosyasındaki " +
    "SUPABASE_URL değerini kendi Supabase proje adresinizle değiştirin."
  );
}
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) {
  console.warn(
    "[EXC Paneli] SUPABASE_ANON_KEY ayarlanmamış. js/config.js dosyasındaki " +
    "SUPABASE_ANON_KEY değerini kendi Supabase proje anahtarınızla değiştirin."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  realtime: {
    params: { eventsPerSecond: 10 }
  }
});
