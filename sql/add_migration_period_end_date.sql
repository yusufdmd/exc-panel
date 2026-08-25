-- =====================================================================
-- Göç dönemlerine bir bitiş tarihi ekler — mevcut "period_date" sütunu
-- artık dönemin BAŞLANGIÇ tarihi olarak kullanılıyor (sıralama hâlâ ona
-- göre yapılır, bkz. database.js -> getMigrationPeriods). Dönem
-- sekmelerinde artık "başlangıç – bitiş" aralığı gösterilecek (bkz.
-- migration.js -> renderMigrationPeriodTabs). Supabase Dashboard > SQL
-- Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_periods add column if not exists period_end_date date;
