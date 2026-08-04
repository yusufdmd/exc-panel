-- Göç adaylarını dönemlere (iki haftalık göç pencerelerine) ayırır.
-- ÖNCE add_migration_prospects.sql ve add_migration_status.sql çalıştırılmış
-- olmalı — bu dosya migration_prospects tablosunu değiştirir.

create table if not exists migration_periods (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  period_date  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_migration_periods_updated_at on migration_periods;
create trigger trg_migration_periods_updated_at
  before update on migration_periods
  for each row execute function set_updated_at();

alter table migration_prospects add column if not exists period_id uuid references migration_periods(id) on delete cascade;
create index if not exists idx_migration_prospects_period on migration_prospects (period_id);

alter table migration_periods enable row level security;

drop policy if exists migration_periods_select_all on migration_periods;
create policy migration_periods_select_all on migration_periods for select using (true);

drop policy if exists migration_periods_insert_auth on migration_periods;
create policy migration_periods_insert_auth on migration_periods for insert with check (auth.role() = 'authenticated');

drop policy if exists migration_periods_update_auth on migration_periods;
create policy migration_periods_update_auth on migration_periods for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists migration_periods_delete_auth on migration_periods;
create policy migration_periods_delete_auth on migration_periods for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table migration_periods;

NOTIFY pgrst, 'reload schema';
