// =====================================================================
// EXC PANELİ — database.js
// =====================================================================
// Eski window.storage.get() / window.storage.set() mantığının yerine
// geçen, Supabase üzerinden çalışan veri erişim katmanı.
//
// members.js, gvg.js, svs.js, ss.js ve app.js bu dosyadaki fonksiyonları
// çağırarak veritabanıyla konuşur. Hiçbir dosya doğrudan `supabase.from`
// çağırmaz — hepsi buradan geçer.
// =====================================================================

import { supabase } from "./supabase.js";
import { EVENT_TYPES } from "./config.js";

// ---------------------------------------------------------------------
// Ortak hata yardımcıları
// ---------------------------------------------------------------------
function dbError(context, error) {
  console.error(`[EXC Paneli][DB] ${context}:`, error);
  throw new Error(`${context}: ${error?.message || "Bilinmeyen veritabanı hatası"}`);
}

function weeksTable(type) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`Bilinmeyen etkinlik türü: ${type}`);
  return `${type}_weeks`;
}
function recordsTable(type) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`Bilinmeyen etkinlik türü: ${type}`);
  return `${type}_records`;
}

// =====================================================================
// MEMBERS — Üyeler
// =====================================================================
export async function getMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) dbError("Üyeler alınamadı", error);
  return data;
}

/**
 * Genel tanıtım sitesi (index.html) için: members tablosunun tamamına
 * (admin girişi gerektirir) değil, sadece aktif üye SAYISINA erişen,
 * herkese açık dar kapsamlı bir RPC çağrısı (bkz. sql/auth_policies.sql
 * -> get_active_member_count). İsim/ID/güç gibi hiçbir ayrıntı dönmez.
 */
export async function getActiveMemberCount() {
  const { data, error } = await supabase.rpc("get_active_member_count");
  if (error) dbError("Aktif üye sayısı alınamadı", error);
  return data;
}

/**
 * Giriş yapmış kullanıcının rolünü (bkz. sql/add_member_role.sql ->
 * current_user_role()) döndürür — "admin" veya "viewer" (salt okunur üye).
 * Çağrı başarısız olursa (RPC henüz yoksa, ağ hatası vb.) en kısıtlı role
 * ("viewer") düşülür — hatalı açık değil, hatalı kapalı davranmak güvenli
 * olan taraf.
 */
export async function getCurrentUserRole() {
  const { data, error } = await supabase.rpc("current_user_role");
  if (error) {
    console.error("[EXC Paneli][DB] Rol alınamadı:", error);
    return "viewer";
  }
  return data;
}

export async function getMember(id) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) dbError("Üye alınamadı", error);
  return data;
}

export async function createMember(payload) {
  const { data, error } = await supabase
    .from("members")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("Üye eklenemedi", error);
  return data;
}

export async function updateMember(id, payload) {
  const { data, error } = await supabase
    .from("members")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) dbError("Üye güncellenemedi", error);
  return data;
}

export async function deleteMember(id) {
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) dbError("Üye silinemedi", error);
  return true;
}

// =====================================================================
// MIGRATION_PERIODS — Göç dönemleri (iki haftalık göç pencereleri)
// =====================================================================
// Etkinlik haftalarının aksine (en eski solda), göç dönemleri EN YENİ
// ÖNCE sıralanır — kullanıcı her zaman güncel dönemi ilk görmek istiyor.
export async function getMigrationPeriods() {
  const { data, error } = await supabase
    .from("migration_periods")
    .select("*")
    .order("period_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) dbError("Göç dönemleri alınamadı", error);
  return data;
}

export async function createMigrationPeriod(payload) {
  const { data, error } = await supabase
    .from("migration_periods")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("Göç dönemi eklenemedi", error);
  return data;
}

export async function updateMigrationPeriod(id, payload) {
  const { data, error } = await supabase
    .from("migration_periods")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) dbError("Göç dönemi güncellenemedi", error);
  return data;
}

export async function deleteMigrationPeriod(id) {
  const { error } = await supabase.from("migration_periods").delete().eq("id", id);
  if (error) dbError("Göç dönemi silinemedi", error);
  return true;
}

// =====================================================================
// MIGRATION_PROSPECTS — Göç sekmesi (bize katılmak isteyen adaylar)
// =====================================================================
export async function getMigrationProspects() {
  const { data, error } = await supabase
    .from("migration_prospects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) dbError("Göç adayları alınamadı", error);
  return data;
}

export async function createMigrationProspect(payload) {
  const { data, error } = await supabase
    .from("migration_prospects")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("Göç adayı eklenemedi", error);
  return data;
}

export async function updateMigrationProspect(id, payload) {
  const { data, error } = await supabase
    .from("migration_prospects")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) dbError("Göç adayı güncellenemedi", error);
  return data;
}

export async function deleteMigrationProspect(id) {
  const { error } = await supabase.from("migration_prospects").delete().eq("id", id);
  if (error) dbError("Göç adayı silinemedi", error);
  return true;
}

// =====================================================================
// MIGRATION_LEADS — genel tanıtım sitesindeki "Göçe Katıl" formundan
// gelen ham başvurular. createMigrationLead giriş yapmamış ziyaretçiler
// tarafından da çağrılır (bkz. sql/add_migration_leads.sql -> insert_public
// politikası); getMigrationLeads/deleteMigrationLead admin oturumu gerektirir.
// =====================================================================
export async function getMigrationLeads() {
  const { data, error } = await supabase
    .from("migration_leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) dbError("Göç başvuruları alınamadı", error);
  return data;
}

export async function createMigrationLead(payload) {
  const { data, error } = await supabase
    .from("migration_leads")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("Göç başvurusu gönderilemedi", error);
  return data;
}

export async function deleteMigrationLead(id) {
  const { error } = await supabase.from("migration_leads").delete().eq("id", id);
  if (error) dbError("Göç başvurusu silinemedi", error);
  return true;
}

// =====================================================================
// NAME_SUGGESTIONS — Üyelerden gelen isim değişikliği önerileri
// =====================================================================
export async function createNameSuggestion(payload) {
  const { data, error } = await supabase
    .from("name_suggestions")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("İsim önerisi gönderilemedi", error);
  return data;
}

export async function getNameSuggestions() {
  const { data, error } = await supabase
    .from("name_suggestions")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) dbError("İsim önerileri alınamadı", error);
  return data;
}

export async function deleteNameSuggestion(id) {
  const { error } = await supabase.from("name_suggestions").delete().eq("id", id);
  if (error) dbError("İsim önerisi silinemedi", error);
  return true;
}

// =====================================================================
// POWER_HISTORY — Güç seviyesi geçmişi
// =====================================================================
export async function getPowerHistory(memberId) {
  const { data, error } = await supabase
    .from("power_history")
    .select("*")
    .eq("member_id", memberId)
    .order("history_date", { ascending: true });
  if (error) dbError("Güç geçmişi alınamadı", error);
  return data;
}

export async function getAllPowerHistory() {
  const { data, error } = await supabase
    .from("power_history")
    .select("*")
    .order("history_date", { ascending: true });
  if (error) dbError("Güç geçmişi alınamadı", error);
  return data;
}

// Aynı gün için ikinci kez kayıt edilirse günceller, farklı günse yeni satır ekler.
export async function addPowerHistoryEntry(memberId, historyDate, power) {
  const { data, error } = await supabase
    .from("power_history")
    .upsert(
      { member_id: memberId, history_date: historyDate, power },
      { onConflict: "member_id,history_date" }
    )
    .select()
    .single();
  if (error) dbError("Güç geçmişi kaydedilemedi", error);
  return data;
}

// =====================================================================
// TEAM_POWER_HISTORY — "1. Takım Gücü" geçmişi (power_history ile birebir aynı desen)
// =====================================================================
export async function getAllTeamPowerHistory() {
  const { data, error } = await supabase
    .from("team_power_history")
    .select("*")
    .order("history_date", { ascending: true });
  if (error) dbError("Takım gücü geçmişi alınamadı", error);
  return data;
}

// Aynı gün için ikinci kez kayıt edilirse günceller, farklı günse yeni satır ekler.
export async function addTeamPowerHistoryEntry(memberId, historyDate, teamPower) {
  const { data, error } = await supabase
    .from("team_power_history")
    .upsert(
      { member_id: memberId, history_date: historyDate, team_power: teamPower },
      { onConflict: "member_id,history_date" }
    )
    .select()
    .single();
  if (error) dbError("Takım gücü geçmişi kaydedilemedi", error);
  return data;
}

// =====================================================================
// ETKİNLİK HAFTALARI (gvg / svs / ss / other ortak)
// =====================================================================
// Haftalar TARİHE göre sıralanır (en eski solda) — eklenme sırasına göre değil.
// Tarihi girilmemiş haftalar sona düşer; aynı tarihli (veya tarihsiz) haftalar
// arasında ise eklenme sırası (created_at) korunur.
export async function getWeeks(type) {
  const { data, error } = await supabase
    .from(weeksTable(type))
    .select("*")
    .order("week_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) dbError(`${type.toUpperCase()} haftaları alınamadı`, error);
  return data;
}

export async function createWeek(type, payload) {
  const { data, error } = await supabase
    .from(weeksTable(type))
    .insert(payload)
    .select()
    .single();
  if (error) dbError(`${type.toUpperCase()} haftası eklenemedi`, error);
  return data;
}

export async function updateWeek(type, weekId, payload) {
  const { data, error } = await supabase
    .from(weeksTable(type))
    .update(payload)
    .eq("id", weekId)
    .select()
    .single();
  if (error) dbError(`${type.toUpperCase()} haftası güncellenemedi`, error);
  return data;
}

export async function deleteWeek(type, weekId) {
  const { error } = await supabase.from(weeksTable(type)).delete().eq("id", weekId);
  if (error) dbError(`${type.toUpperCase()} haftası silinemedi`, error);
  return true;
}

// =====================================================================
// ETKİNLİK KAYITLARI (üye × hafta bazlı giriş — gvg / svs / ss / other ortak)
// =====================================================================
export async function getRecordsForWeek(type, weekId) {
  const { data, error } = await supabase
    .from(recordsTable(type))
    .select("*")
    .eq("week_id", weekId);
  if (error) dbError(`${type.toUpperCase()} kayıtları alınamadı`, error);
  return data;
}

export async function getAllRecords(type) {
  const { data, error } = await supabase.from(recordsTable(type)).select("*");
  if (error) dbError(`${type.toUpperCase()} kayıtları alınamadı`, error);
  return data;
}

// payload: { week_id, member_id, ...alanlar }  — (week_id, member_id) eşleşirse günceller.
export async function upsertRecord(type, payload) {
  const { data, error } = await supabase
    .from(recordsTable(type))
    .upsert(payload, { onConflict: "week_id,member_id" })
    .select()
    .single();
  if (error) dbError(`${type.toUpperCase()} kaydı kaydedilemedi`, error);
  return data;
}

// Toplu giriş ekranından (bir haftanın tüm üyeleri) tek seferde kaydetmek için.
export async function upsertRecordsBulk(type, payloads) {
  if (!payloads || !payloads.length) return [];
  const { data, error } = await supabase
    .from(recordsTable(type))
    .upsert(payloads, { onConflict: "week_id,member_id" })
    .select();
  if (error) dbError(`${type.toUpperCase()} kayıtları kaydedilemedi`, error);
  return data;
}

export async function deleteRecordsForWeek(type, weekId) {
  const { error } = await supabase.from(recordsTable(type)).delete().eq("week_id", weekId);
  if (error) dbError(`${type.toUpperCase()} kayıtları silinemedi`, error);
  return true;
}

export async function deleteRecordsForMember(type, memberId) {
  const { error } = await supabase.from(recordsTable(type)).delete().eq("member_id", memberId);
  if (error) dbError(`${type.toUpperCase()} kayıtları silinemedi`, error);
  return true;
}

// Bir üye tamamen silindiğinde tüm etkinlik türlerinden kayıtlarını temizler.
export async function deleteAllRecordsForMember(memberId) {
  await Promise.all([
    deleteRecordsForMember("gvg", memberId),
    deleteRecordsForMember("svs", memberId),
    deleteRecordsForMember("ss", memberId),
    deleteRecordsForMember("kod", memberId),
    deleteRecordsForMember("other", memberId)
  ]);
  return true;
}

// =====================================================================
// SETTINGS — Uygulama geneli ayarlar (anahtar/değer)
// =====================================================================
export async function getSetting(key, fallback = null) {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) dbError("Ayar alınamadı", error);
  return data ? data.value : fallback;
}

export async function setSetting(key, value) {
  const { data, error } = await supabase
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" })
    .select()
    .single();
  if (error) dbError("Ayar kaydedilemedi", error);
  return data;
}

// =====================================================================
// SITE_LINKS — genel tanıtım sitesindeki Discord/YouTube/Instagram
// linkleri. getSiteLinks herkese açıktır (site üzerinde görünecekler
// için); updateSiteLinks admin oturumu gerektirir.
// =====================================================================
export async function getSiteLinks() {
  const { data, error } = await supabase
    .from("site_links")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) dbError("Site linkleri alınamadı", error);
  return data || {};
}

export async function updateSiteLinks(payload) {
  const { data, error } = await supabase
    .from("site_links")
    .update(payload)
    .eq("id", 1)
    .select()
    .single();
  if (error) dbError("Site linkleri güncellenemedi", error);
  return data;
}

// =====================================================================
// NEWS — ana sayfadaki "Haberler" bölümü. getNews herkese açıktır; diğerleri
// admin oturumu gerektirir. Resimler Supabase Storage'a (news-images
// bucket'ı) yüklenir, veritabanında sadece herkese açık URL tutulur.
// =====================================================================
export async function getNews() {
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) dbError("Haberler alınamadı", error);
  return data;
}

export async function createNews(payload) {
  const { data, error } = await supabase
    .from("news")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("Haber eklenemedi", error);
  return data;
}

export async function updateNews(id, payload) {
  const { data, error } = await supabase
    .from("news")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) dbError("Haber güncellenemedi", error);
  return data;
}

export async function deleteNews(id) {
  const { error } = await supabase.from("news").delete().eq("id", id);
  if (error) dbError("Haber silinemedi", error);
  return true;
}

/** Haber resmini Supabase Storage'a ("news-images" bucket'ı) yükler ve herkese açık URL'ini döndürür. */
export async function uploadNewsImage(file) {
  const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `${crypto.randomUUID()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage.from("news-images").upload(filePath, file);
  if (uploadError) dbError("Resim yüklenemedi", uploadError);
  const { data } = supabase.storage.from("news-images").getPublicUrl(filePath);
  return data.publicUrl;
}

// =====================================================================
// FEATURED_VIDEOS — ana sayfadaki "YouTube Kanalımız" bölümünde dönen
// video vitrini. Okuma herkese açık, yazma admin oturumu gerektirir.
// =====================================================================
export async function getFeaturedVideos() {
  const { data, error } = await supabase
    .from("featured_videos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) dbError("Videolar alınamadı", error);
  return data;
}

export async function createFeaturedVideo(payload) {
  const { data, error } = await supabase
    .from("featured_videos")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("Video eklenemedi", error);
  return data;
}

export async function updateFeaturedVideo(id, payload) {
  const { data, error } = await supabase
    .from("featured_videos")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) dbError("Video güncellenemedi", error);
  return data;
}

export async function deleteFeaturedVideo(id) {
  const { error } = await supabase.from("featured_videos").delete().eq("id", id);
  if (error) dbError("Video silinemedi", error);
  return true;
}

// =====================================================================
// USERS — Liderler
// =====================================================================
export async function getUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) dbError("Kullanıcılar alınamadı", error);
  return data;
}

export async function createUser(payload) {
  const { data, error } = await supabase
    .from("users")
    .insert(payload)
    .select()
    .single();
  if (error) dbError("Kullanıcı eklenemedi", error);
  return data;
}

export async function touchUserLogin(userId) {
  const { error } = await supabase
    .from("users")
    .update({ last_login: new Date().toISOString() })
    .eq("id", userId);
  if (error) dbError("Giriş zamanı güncellenemedi", error);
  return true;
}

// =====================================================================
// ACTIVITY_LOGS — Kim, ne zaman, neyi değiştirdi
// =====================================================================
export async function logActivity(action, entityType, entityId, details = {}, actor = "leader") {
  const { error } = await supabase.from("activity_logs").insert({
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details
  });
  // Aktivite kaydı başarısız olsa bile ana işlemi bozmasın diye sadece loglanır.
  if (error) console.error("[EXC Paneli][DB] Aktivite kaydı yazılamadı:", error);
}

export async function getRecentActivity(limit = 50) {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) dbError("Aktivite geçmişi alınamadı", error);
  return data;
}

// =====================================================================
// REALTIME — Tabloyu canlı dinlemek için (eski 12sn yoklamanın yerine)
// =====================================================================
// Kullanım: const unsubscribe = subscribeToTable('members', () => reloadUI());
//           ... daha sonra: unsubscribe();
export function subscribeToTable(table, onChange) {
  const channel = supabase
    .channel(`realtime:${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      onChange(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Birden fazla tabloyu tek çağrıda dinlemek için kısayol.
export function subscribeToTables(tables, onChange) {
  const unsubscribers = tables.map((table) => subscribeToTable(table, onChange));
  return () => unsubscribers.forEach((fn) => fn());
}
