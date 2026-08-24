-- =====================================================================
-- Göç adaylarının "Durum" alanına (Kesin/Belirsiz) üçüncü bir seçenek
-- ekler: "Yedek" (yer kalırsa alınacak adaylar). Supabase Dashboard >
-- SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects drop constraint if exists migration_prospects_status_check;
alter table migration_prospects add constraint migration_prospects_status_check
  check (status in ('certain', 'uncertain', 'waitlist'));
