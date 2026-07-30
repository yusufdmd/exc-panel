-- =====================================================================
-- EXC PANELİ — add_king_of_desert.sql
-- =====================================================================
-- Yeni bir etkinlik türü: King of Desert (kod). init.sql ve
-- auth_policies.sql'i daha önce çalıştırdıysanız, bunu Supabase
-- Dashboard > SQL Editor'de yeni/boş bir sorguda bir kere çalıştırın.
-- Bu dosya kendi kendine yeterlidir — tabloları, RLS politikalarını
-- (okuma herkese açık, yazma sadece giriş yapmış admin) ve realtime
-- aboneliğini tek seferde kurar.
--
-- King of Desert diğer türlerden farklı olarak PUAN tutmaz — sadece
-- katıldı/katılmadı/bilgi yok durumu ve mazeret bilgisi vardır.
-- =====================================================================

create table if not exists kod_weeks (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  week_date   date,
  created_at  timestamptz not null default now()
);

create table if not exists kod_records (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references kod_weeks(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  status      text not null default 'unknown' check (status in ('joined','absent','unknown')),
  excused     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, member_id)
);

create index if not exists idx_kod_records_week   on kod_records (week_id);
create index if not exists idx_kod_records_member on kod_records (member_id);

drop trigger if exists trg_kod_records_updated_at on kod_records;
create trigger trg_kod_records_updated_at
  before update on kod_records
  for each row execute function set_updated_at();

-- RLS: okuma herkese açık, yazma sadece giriş yapmış (admin) kullanıcıya.
do $$
declare
  t text;
begin
  for t in select unnest(array['kod_weeks','kod_records'])
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists %I on %I;', t || '_select_all', t);
    execute format('create policy %I on %I for select using (true);', t || '_select_all', t);

    execute format('drop policy if exists %I on %I;', t || '_insert_auth', t);
    execute format(
      'create policy %I on %I for insert with check (auth.role() = ''authenticated'');',
      t || '_insert_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_update_auth', t);
    execute format(
      'create policy %I on %I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      t || '_update_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_delete_auth', t);
    execute format(
      'create policy %I on %I for delete using (auth.role() = ''authenticated'');',
      t || '_delete_auth', t
    );
  end loop;
end $$;

alter publication supabase_realtime add table kod_weeks, kod_records;

NOTIFY pgrst, 'reload schema';
