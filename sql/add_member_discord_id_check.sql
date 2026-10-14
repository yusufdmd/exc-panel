-- =====================================================================
-- EXC PANELİ — add_member_discord_id_check.sql
-- =====================================================================
-- members.discord_id için veritabanı seviyesinde format kısıtı: boş ya da
-- 17-20 basamaklı sayısal Discord ID olmalı. Panel formu bunu zaten
-- doğruluyor, ama istemci tarafı kontrol API'ye doğrudan atılan bir
-- istekle atlanabilir. Supabase Dashboard > SQL Editor'de bir kere
-- çalıştırın (add_member_discord_id.sql'den SONRA).
--
-- Mevcut satırlardan biri formata uymuyorsa kısıt eklenemez ve hata
-- verir — önce şununla bakın:
--   select id, name, discord_id from members
--   where discord_id is not null and discord_id !~ '^[0-9]{17,20}$';
-- =====================================================================

alter table members drop constraint if exists members_discord_id_format;
alter table members add constraint members_discord_id_format
  check (discord_id is null or discord_id ~ '^[0-9]{17,20}$');

NOTIFY pgrst, 'reload schema';
