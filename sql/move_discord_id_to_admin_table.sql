-- =====================================================================
-- EXC PANELİ — move_discord_id_to_admin_table.sql
-- =====================================================================
-- Discord ID'leri SADECE admin'lerin görebilmesi için members tablosundan
-- ayrı, admin-only bir tabloya taşır. Supabase Dashboard > SQL Editor'de
-- bir kere çalıştırın (add_member_discord_id.sql ve
-- add_member_discord_id_check.sql'den SONRA).
--
-- NEDEN AYRI TABLO: members tablosunu "üye" (viewer) rolü de okuyabiliyor
-- (bkz. add_member_role.sql). Admin ve viewer aynı Postgres rolüyle
-- (authenticated) bağlandığı için sütun bazlı GRANT ile ayrım yapılamaz —
-- arayüzde gizlemek de yetmez, viewer tarayıcı konsolundan sütunu çekebilir.
-- Ayrı tabloda RLS ile okuma/yazma tamamen admin'e kısıtlanır.
--
-- ÖNEMLİ SIRA: Bunu çalıştırdıktan HEMEN sonra panel kodunun yeni sürümü
-- yayına alınmalı — eski kod members.discord_id'ye yazmaya çalışır ve sütun
-- artık olmadığı için üye kaydetme hata verir.
-- =====================================================================

create table if not exists member_discord_ids (
  member_id   uuid primary key references members(id) on delete cascade,
  discord_id  text not null check (discord_id ~ '^[0-9]{17,20}$'),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_member_discord_ids_updated_at on member_discord_ids;
create trigger trg_member_discord_ids_updated_at
  before update on member_discord_ids
  for each row execute function set_updated_at();

alter table member_discord_ids enable row level security;

drop policy if exists member_discord_ids_select_admin on member_discord_ids;
create policy member_discord_ids_select_admin on member_discord_ids
  for select using (public.current_user_role() = 'admin');

drop policy if exists member_discord_ids_insert_admin on member_discord_ids;
create policy member_discord_ids_insert_admin on member_discord_ids
  for insert with check (public.current_user_role() = 'admin');

drop policy if exists member_discord_ids_update_admin on member_discord_ids;
create policy member_discord_ids_update_admin on member_discord_ids
  for update using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

drop policy if exists member_discord_ids_delete_admin on member_discord_ids;
create policy member_discord_ids_delete_admin on member_discord_ids
  for delete using (public.current_user_role() = 'admin');

-- Mevcut Discord ID'leri yeni tabloya kopyala, sonra members'tan sütunu kaldır
-- (format kısıtı members_discord_id_format da sütunla birlikte gider).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'discord_id'
  ) then
    insert into member_discord_ids (member_id, discord_id)
    select id, discord_id from members where discord_id is not null
    on conflict (member_id) do nothing;

    alter table members drop column discord_id;
  end if;
end $$;

-- Realtime: başka bir admin Discord ID değiştirince panel anında yenilensin.
do $$
begin
  alter publication supabase_realtime add table member_discord_ids;
exception when duplicate_object then null;
end $$;

NOTIFY pgrst, 'reload schema';
