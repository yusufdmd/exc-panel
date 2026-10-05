-- =====================================================================
-- Göç başvuru formuna "Göç Rengi / Ünvan" sorusu eklendi (migration_leads.color)
-- ve başvurudaki İletişim/Mesaj bilgileri onay (aday) listesine taşınabilsin
-- diye migration_prospects'e contact/message kolonları eklendi.
--
-- Supabase Dashboard > SQL Editor'de çalıştırın. Tamamen eklemeli ve
-- idempotent (if not exists) — tekrar çalıştırmak güvenli, veri kaybı yok.
-- Mevcut RLS politikalarına dokunmaz.
-- =====================================================================

alter table migration_leads
  add column if not exists color text
  check (color in ('gold','purple','blue','gray') or color is null);

alter table migration_prospects add column if not exists contact text;
alter table migration_prospects add column if not exists message text;

NOTIFY pgrst, 'reload schema';
