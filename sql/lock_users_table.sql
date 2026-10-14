-- =====================================================================
-- EXC PANELİ — lock_users_table.sql
-- =====================================================================
-- GÜVENLİK DÜZELTMESİ (2026-10-14): `users` tablosuna API üzerinden
-- yazmayı tamamen kapatır. Supabase Dashboard > SQL Editor'de bir kere
-- çalıştırın.
--
-- SORUN: add_member_role.sql, `users` tablosunda INSERT/UPDATE/DELETE'i
-- her admin'e açıyordu. "Hesap Kasası" izni (can_access_vault, bkz.
-- add_account_vault_access_control.sql) ve rol bilgisi bu tablodan
-- okunduğu için, kasa izni OLMAYAN bir admin PostgREST'e doğrudan istek
-- atıp kendi satırını ekleyerek/güncelleyerek kendine can_access_vault=true
-- verebiliyor (ve başka adminleri 'viewer'a düşürebiliyordu).
--
-- ÇÖZÜM: Panel kodu bu tabloya hiç yazmıyor (sadece SQL Editor'den
-- yönetiliyor), bu yüzden anon/authenticated için yazma yetkisi tamamen
-- kaldırılır. SELECT (admin-only) aynen kalır. SQL Editor (postgres
-- rolü) ve security definer fonksiyonlar etkilenmez.
--
-- REVOKE, RLS politikalarından ÖNCE kontrol edilir — yani ileride
-- add_member_role.sql / init.sql tekrar çalıştırılıp yazma politikaları
-- geri gelse bile bu kilit geçerli kalır.
--
-- Bundan sonra birine kasa izni vermek/almak, rol değiştirmek veya yeni
-- viewer eklemek için SQL Editor'de doğrudan güncelleyin, ör.:
--   update users set can_access_vault = true where username = '...';
-- =====================================================================

alter table users enable row level security;

drop policy if exists users_insert_auth on users;
drop policy if exists users_update_auth on users;
drop policy if exists users_delete_auth on users;

revoke insert, update, delete, truncate on table users from anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- KONTROL: Çalıştırdıktan sonra kasa iznine sahip hesapları listeleyin.
-- Sadece yusuf ve queenboo görünmeli — başka biri varsa açık daha önce
-- kullanılmış olabilir, o satırı düzeltin.
-- ---------------------------------------------------------------------
select username, role, can_access_vault, auth_user_id, created_at
from users
order by can_access_vault desc, created_at;
