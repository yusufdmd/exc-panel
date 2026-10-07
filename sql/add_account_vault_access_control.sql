-- =====================================================================
-- "Hesap Kasası"na erişimi, admin/viewer ayrımından BAĞIMSIZ, ayrı bir
-- izin olarak kısıtlar. Varsayılan KAPALI — hiçbir admin (yusuf/queenboo
-- hariç) can_access_vault=true olmadan bu tabloyu göremez/yazamaz, ileride
-- tek tek başka adminlere açılabilir (users tablosunda o satırı
-- can_access_vault=true yapmak yeterli).
--
-- current_user_role() (admin/viewer ayrımı) hiç değişmiyor — sadece
-- account_vault tablosuna ek bir ikinci kilit ekleniyor.
--
-- Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

alter table users add column if not exists can_access_vault boolean not null default false;

create or replace function public.current_user_can_access_vault()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.role() <> 'authenticated' then false
    else coalesce((select can_access_vault from users where auth_user_id = auth.uid() limit 1), false)
  end;
$$;

grant execute on function public.current_user_can_access_vault() to authenticated;

-- account_vault politikaları artık HEM admin HEM can_access_vault=true ister.
drop policy if exists account_vault_select_admin on account_vault;
create policy account_vault_select_admin on account_vault
  for select using (public.current_user_role() = 'admin' and public.current_user_can_access_vault());

drop policy if exists account_vault_insert_admin on account_vault;
create policy account_vault_insert_admin on account_vault
  for insert with check (public.current_user_role() = 'admin' and public.current_user_can_access_vault());

drop policy if exists account_vault_update_admin on account_vault;
create policy account_vault_update_admin on account_vault
  for update using (public.current_user_role() = 'admin' and public.current_user_can_access_vault())
  with check (public.current_user_role() = 'admin' and public.current_user_can_access_vault());

drop policy if exists account_vault_delete_admin on account_vault;
create policy account_vault_delete_admin on account_vault
  for delete using (public.current_user_role() = 'admin' and public.current_user_can_access_vault());

-- yusuf ve queenboo'ya erişim açılıyor — başka hiçbir satır dokunulmuyor.
-- Daha önce users tablosunda kaydı olmayan admin hesapları için (çoğu admin
-- böyledir) yeni bir satır oluşturuluyor; var olan satırlar sadece
-- can_access_vault alanı güncelleniyor.
insert into users (username, display_name, role, auth_user_id, can_access_vault)
select 'yusuf', 'Yusuf', 'admin', id, true from auth.users where email = 'yusuf@excpaneli.local'
on conflict (username) do update set can_access_vault = true, auth_user_id = excluded.auth_user_id;

insert into users (username, display_name, role, auth_user_id, can_access_vault)
select 'queenboo', 'Queenboo', 'admin', id, true from auth.users where email = 'queenboo@excpaneli.local'
on conflict (username) do update set can_access_vault = true, auth_user_id = excluded.auth_user_id;

NOTIFY pgrst, 'reload schema';
