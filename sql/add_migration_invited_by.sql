-- =====================================================================
-- Göç adaylarına, kimi kimin davet ettiğini/önerdiğini kaydetmek için
-- serbest metin bir "Davet Eden" alanı ekler. Supabase Dashboard >
-- SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists invited_by text;
