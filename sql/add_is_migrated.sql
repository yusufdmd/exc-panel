-- =====================================================================
-- EXC PANELİ — add_is_migrated.sql
-- =====================================================================
-- add_migration_tracking.sql'i DAHA ÖNCE çalıştırdıysanız, şimdi bunu
-- Supabase Dashboard > SQL Editor'de bir kere çalıştırın. SADECE bu
-- dosyadaki komutları çalıştırın, init.sql'in tamamını tekrar
-- çalıştırmayın.
--
-- "Göç etti" artık migrated_to_server sütununun dolu olup olmamasından
-- BAĞIMSIZ bir işarettir — hangi sunucuya göç ettiğini bilmesek bile
-- bir üyeyi "göç etti" olarak işaretleyebilmek için.
-- =====================================================================

alter table members add column if not exists is_migrated boolean not null default false;
create index if not exists idx_members_is_migrated on members (is_migrated);

NOTIFY pgrst, 'reload schema';
