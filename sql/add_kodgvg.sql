-- =====================================================================
-- EXC PANELİ — "KOD - GVG" etkinlik türü
-- =====================================================================
-- GVG ile BİREBİR aynı yapı/puanlama (gvg_weeks/gvg_records'un birebir
-- kopyası) — sadece ayrı bir tabloda, ayrı bir sekme olarak tutulur.
--
-- Bu tablolar için, projede zaten ÇALIŞAN güncel güvenlik modeliyle
-- (bkz. sql/add_member_role.sql -> bölüm 2) BİREBİR aynı politikalar
-- doğrudan burada kuruluyor: OKUMA giriş yapan herkese (admin + "üye"
-- rolü) açık, YAZMA (ekle/güncelle/sil) sadece admin'e açık — tıpkı
-- gvg_weeks/gvg_records gibi. current_user_role() fonksiyonunun zaten
-- var olması gerekir (add_member_role.sql daha önce çalıştırılmış olmalı).
--
-- Supabase SQL Editor'de bir kere çalıştırmanız yeterli.
-- =====================================================================

create table if not exists kodgvg_weeks (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  week_date   date,
  created_at  timestamptz not null default now()
);

create table if not exists kodgvg_records (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references kodgvg_weeks(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  points      bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, member_id)
);

create index if not exists idx_kodgvg_records_week   on kodgvg_records (week_id);
create index if not exists idx_kodgvg_records_member on kodgvg_records (member_id);

drop trigger if exists trg_kodgvg_records_updated_at on kodgvg_records;
create trigger trg_kodgvg_records_updated_at
  before update on kodgvg_records
  for each row execute function set_updated_at();

do $$
declare
  t text;
begin
  for t in select unnest(array['kodgvg_weeks', 'kodgvg_records'])
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists %I on %I;', t || '_select_auth', t);
    execute format(
      'create policy %I on %I for select using (auth.role() = ''authenticated'');',
      t || '_select_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_insert_auth', t);
    execute format(
      'create policy %I on %I for insert with check (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'');',
      t || '_insert_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_update_auth', t);
    execute format(
      'create policy %I on %I for update using (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'') with check (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'');',
      t || '_update_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_delete_auth', t);
    execute format(
      'create policy %I on %I for delete using (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'');',
      t || '_delete_auth', t
    );
  end loop;
end $$;

-- Realtime — anlık güncellemelerin diğer sekmeler gibi çalışması için.
alter publication supabase_realtime add table kodgvg_weeks, kodgvg_records;

NOTIFY pgrst, 'reload schema';
