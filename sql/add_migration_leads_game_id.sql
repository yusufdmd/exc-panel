-- "Göçe Katıl" formuna ID Numarası alanı eklendi; başvuru tablosuna da
-- karşılık gelen sütunu ekler.
alter table migration_leads add column if not exists game_id text;

NOTIFY pgrst, 'reload schema';
