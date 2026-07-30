-- =====================================================================
-- EXC PANELİ — add_name_history.sql
-- =====================================================================
-- init.sql'i DAHA ÖNCE çalıştırdıysanız (bu sütun o zaman yoktu), bunu
-- Supabase Dashboard > SQL Editor'de bir kere çalıştırın. Yeni bir
-- kurulum yapıyorsanız buna gerek yok — güncel init.sql zaten bu
-- sütunla birlikte gelir.
--
-- Üye adı değiştirildiğinde eski adı [{name, changedAt}, ...] biçiminde
-- saklar; kişi kartındaki "Önceki Kullanıcı Adları" bölümü buradan okur.
-- =====================================================================

alter table members add column if not exists name_history jsonb not null default '[]'::jsonb;
