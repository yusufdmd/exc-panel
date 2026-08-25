-- =====================================================================
-- Göç adaylarına, üye kaydındaki ile aynı "Kamp Seviyesi" / "1. Takım
-- Gücü" / "1. Takım Elementi" alanlarını ekler — aday göç ettiğinde bu
-- bilgiler zaten üye ekleme formuna hazır gelsin diye (bkz. migration.js
-- -> approveProspect). Supabase Dashboard > SQL Editor içine yapıştırıp
-- çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists camp_level text;
alter table migration_prospects add column if not exists team_power bigint;
alter table migration_prospects add column if not exists team_element text check (team_element in ('water','fire','earth','electric') or team_element is null);
