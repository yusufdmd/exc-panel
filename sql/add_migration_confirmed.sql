-- =====================================================================
-- Göç adaylarına "Onayda" (doğrulandı, unvanı belli, göç edeceği
-- kesinleşti — "Adaylar" ile "Başarısız" arasındaki ara durum) işareti
-- eklenmesini sağlar. Supabase Dashboard > SQL Editor içine yapıştırıp
-- çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists confirmed boolean not null default false;
