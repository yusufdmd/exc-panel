-- =====================================================================
-- Göç adaylarına serbest metin bir "Tahmini Gidecek Lonca/Not" alanı
-- ekler. Supabase Dashboard > SQL Editor içine yapıştırıp çalıştırın
-- (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists note text;
