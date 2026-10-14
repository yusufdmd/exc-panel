-- =====================================================================
-- EXC PANELİ — add_member_discord_id.sql
-- =====================================================================
-- Üye tablosuna "Discord ID" alanını ekler. Supabase Dashboard > SQL
-- Editor'de bir kere çalıştırın.
--
-- ÖNEMLİ SIRA: Bu SQL, panel kodunun yeni sürümü yayına alınmadan ÖNCE
-- çalıştırılmalı — yeni kod üye kaydederken discord_id sütununa yazar.
--
-- Discord kullanıcı adı değişebilir ama Discord ID (17-20 basamaklı
-- sayısal "snowflake") hiç değişmez; bir üyeye Discord'dan ulaşmak
-- gerektiğinde kim olduğunu bulmak için kullanılır. Opsiyoneldir.
-- =====================================================================

alter table members add column if not exists discord_id text;

NOTIFY pgrst, 'reload schema';
