-- =====================================================================
-- Göç adaylarına, "Unvan"ın hemen altında görünecek bir "Puan" alanı
-- ekler (bkz. migration.js -> renderMigration). Skor hesaplama kuralı
-- henüz kesinleşmedi — şimdilik admin tarafından elle girilen, serbest
-- bir sayı alanıdır. Supabase Dashboard > SQL Editor içine yapıştırıp
-- çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists score bigint;
