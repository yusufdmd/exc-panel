-- =====================================================================
-- EXC PANELİ — add_migration_tracking.sql
-- =====================================================================
-- init.sql'i DAHA ÖNCE çalıştırdıysanız (bu sütunlar o zaman yoktu),
-- bunu Supabase Dashboard > SQL Editor'de bir kere çalıştırın. SADECE
-- bu dosyadaki komutları çalıştırın — init.sql'in tamamını tekrar
-- çalıştırmayın, "relation is already member of publication" hatası
-- alırsınız (bkz. proje geçmişi).
--
-- "Göç Edenler" sekmesi için:
--   - migrated_to_server: dolu olması, bu üyenin başka bir sunucuya
--     göç ettiğini gösterir (Aktif/Eski Üye listelerinden hariç tutulur).
--   - name/game_id artık NOT NULL değil — göç eden kişiler hakkında
--     eksik bilgimiz olabilir.
-- =====================================================================

alter table members add column if not exists migrated_to_server bigint;
alter table members alter column name drop not null;
alter table members alter column game_id drop not null;

NOTIFY pgrst, 'reload schema';
