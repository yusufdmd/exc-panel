-- =====================================================================
-- Üye tablosuna "1. Takım Gücü" ve "1. Takım Elementi" alanlarını ekler.
-- Supabase Dashboard > SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table members add column if not exists team_power bigint not null default 0;
alter table members add column if not exists team_element text
  check (team_element in ('water', 'fire', 'earth', 'electric'));
