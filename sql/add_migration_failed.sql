-- =====================================================================
-- Göç adaylarına "Başarısız" (kontenjan yetersizliği vb. nedenlerle
-- gelemedi) işareti eklenmesini sağlar. Supabase Dashboard > SQL Editor
-- içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists failed boolean not null default false;
