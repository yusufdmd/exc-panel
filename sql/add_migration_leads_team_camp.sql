-- "Göçe Katıl" formuna Kamp Seviyesi + 1. Takım Gücü/Elementi alanları
-- eklendi (migration_prospects'teki karşılığıyla aynı, bkz.
-- add_migration_team_camp.sql); genel siteden gelen ham başvuru
-- tablosuna da karşılık gelen sütunları ekler.
alter table migration_leads add column if not exists camp_level text;
alter table migration_leads add column if not exists team_power bigint;
alter table migration_leads add column if not exists team_element text check (team_element in ('water','fire','earth','electric') or team_element is null);

NOTIFY pgrst, 'reload schema';
