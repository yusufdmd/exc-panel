-- =====================================================================
-- Göç başvurularına durum (bekleyen / elenen) eklenir. "✕" artık kaydı
-- silmek yerine "Elenenler" listesine taşır; oradan geri alınabilir ya da
-- kalıcı olarak silinebilir.
--
-- Supabase Dashboard > SQL Editor'de çalıştırın. Eklemeli ve idempotent;
-- mevcut hiçbir satır silinmez. Mevcut başvurular otomatik 'pending' olur.
-- Ayrıca migration_leads için admin'e UPDATE izni verilir (önceden yoktu).
-- =====================================================================

alter table migration_leads
  add column if not exists status text not null default 'pending'
  check (status in ('pending','rejected'));

drop policy if exists migration_leads_update_admin on migration_leads;
create policy migration_leads_update_admin on migration_leads
  for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

NOTIFY pgrst, 'reload schema';
