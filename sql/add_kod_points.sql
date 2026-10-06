-- =====================================================================
-- King of Desert kayıtlarına puan kolonu (SVS gibi). Mevcut kayıtlar 0 alır,
-- hiçbir veri silinmez. Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

alter table kod_records add column if not exists points bigint not null default 0;

NOTIFY pgrst, 'reload schema';
