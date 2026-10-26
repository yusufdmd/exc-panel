-- =====================================================================
-- EXC PANELİ — add_team_power_suggestions.sql
-- =====================================================================
-- Discord'daki "/suggest-team-power" slash komutuyla oyuncuların kendi
-- "1. Ekip" ekran görüntüsünü yüklemesiyle oluşan, bir AI'nin okuyup bir
-- admin/R4'ün onayını beklediği takım gücü + element önerilerini tutar.
-- self_report_submissions ile AYNI desen (bkz. o dosyadaki NOT) - reddedilen
-- kayıt silinmez, 'rejected' olarak durur.
-- =====================================================================

create table if not exists team_power_suggestions (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  discord_id    text not null,
  team_power    bigint not null,
  team_element  text not null check (team_element in ('water','fire','earth','electric')),
  image_url     text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  reviewed_by   text,
  reviewed_at   timestamptz
);

create index if not exists idx_team_power_suggestions_status on team_power_suggestions (status, created_at desc);

alter table team_power_suggestions enable row level security;

drop policy if exists team_power_suggestions_select_admin on team_power_suggestions;
create policy team_power_suggestions_select_admin on team_power_suggestions
  for select using (public.current_user_role() = 'admin');

drop policy if exists team_power_suggestions_update_admin on team_power_suggestions;
create policy team_power_suggestions_update_admin on team_power_suggestions
  for update using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

do $$
begin
  alter publication supabase_realtime add table team_power_suggestions;
exception when duplicate_object then null;
end $$;

NOTIFY pgrst, 'reload schema';
