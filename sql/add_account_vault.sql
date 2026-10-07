-- =====================================================================
-- "Hesap Kasası" — oyun hesabı devir/sahiplik süreci için tutulan hassas
-- bilgiler (oyun hesabı e-postası/şifresi, kurtarma e-postası/şifresi).
-- SADECE ADMİN görebilir/düzenleyebilir — viewer rolü bu tabloyu hiç
-- göremez (RLS seviyesinde, panelin kendisinde de sekme hiç gösterilmez).
--
-- Şifre alanları (game_password_enc, recovery_email_password_enc) veritabanına
-- HİÇBİR ZAMAN düz metin yazılmaz — tarayıcı, kaydetmeden önce bunları
-- api/account-vault-crypto.js üzerinden (sadece admin, sadece sunucu
-- tarafında bilinen bir anahtarla) şifreletir. Yani bu tablo (ya da tüm
-- veritabanı) bir şekilde sızsa bile şifreler okunabilir halde değildir —
-- anahtar sadece Vercel ortam değişkenlerinde (ACCOUNT_VAULT_KEY) durur.
--
-- member_id OPSİYONELDİR: bir üyeyle eşleştirilebilir (isim/ID oradan
-- gelir) ya da tamamen bağımsız, serbest metinle girilebilir (aynı
-- sunucudaki, henüz üye olmayan bir hesap için).
--
-- Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

create table if not exists account_vault (
  id                          uuid primary key default gen_random_uuid(),
  member_id                   uuid references members(id) on delete set null,
  game_id                     text,
  name                        text not null,
  game_email                  text,
  game_password_enc           text,
  has_email_access            boolean not null default false,
  recovery_email              text,
  recovery_email_password_enc text,
  note                        text,
  created_by                  text,
  created_at                  timestamptz not null default now(),
  updated_by                  text,
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_account_vault_member on account_vault (member_id);

drop trigger if exists trg_account_vault_updated_at on account_vault;
create trigger trg_account_vault_updated_at
  before update on account_vault
  for each row execute function set_updated_at();

alter table account_vault enable row level security;

drop policy if exists account_vault_select_admin on account_vault;
create policy account_vault_select_admin on account_vault
  for select using (public.current_user_role() = 'admin');

drop policy if exists account_vault_insert_admin on account_vault;
create policy account_vault_insert_admin on account_vault
  for insert with check (public.current_user_role() = 'admin');

drop policy if exists account_vault_update_admin on account_vault;
create policy account_vault_update_admin on account_vault
  for update using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

drop policy if exists account_vault_delete_admin on account_vault;
create policy account_vault_delete_admin on account_vault
  for delete using (public.current_user_role() = 'admin');

alter publication supabase_realtime add table account_vault;

NOTIFY pgrst, 'reload schema';
