-- =====================================================================
-- EXC PANELİ — add_team_power_history.sql
-- =====================================================================
-- Ana "Güç" alanı gibi, "1. Takım Gücü" için de zaman içindeki geçmişini
-- ayrı bir tabloda takip eder (bkz. power_history). init.sql,
-- auth_policies.sql ve add_member_role.sql daha önce çalıştırıldıysa,
-- bunu Supabase Dashboard > SQL Editor'de yeni/boş bir sorguda bir kere
-- çalıştırın. Kendi kendine yeterlidir; okuma yapan/giriş yapmış herkese
-- (admin + üye) açık, yazma sadece admin'e açıktır — power_history ile
-- birebir aynı politika deseni (current_user_role()).
-- =====================================================================

create table if not exists team_power_history (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  history_date  date not null,
  team_power    bigint not null,
  created_at    timestamptz not null default now(),
  unique (member_id, history_date)
);

create index if not exists idx_team_power_history_member on team_power_history (member_id);

alter table team_power_history enable row level security;

drop policy if exists team_power_history_select_auth on team_power_history;
create policy team_power_history_select_auth on team_power_history
  for select using (auth.role() = 'authenticated');

drop policy if exists team_power_history_insert_auth on team_power_history;
create policy team_power_history_insert_auth on team_power_history
  for insert with check (auth.role() = 'authenticated' and public.current_user_role() = 'admin');

drop policy if exists team_power_history_update_auth on team_power_history;
create policy team_power_history_update_auth on team_power_history
  for update using (auth.role() = 'authenticated' and public.current_user_role() = 'admin')
  with check (auth.role() = 'authenticated' and public.current_user_role() = 'admin');

drop policy if exists team_power_history_delete_auth on team_power_history;
create policy team_power_history_delete_auth on team_power_history
  for delete using (auth.role() = 'authenticated' and public.current_user_role() = 'admin');

alter publication supabase_realtime add table team_power_history;

NOTIFY pgrst, 'reload schema';
