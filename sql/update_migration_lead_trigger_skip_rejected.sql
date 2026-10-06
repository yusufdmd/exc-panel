-- =====================================================================
-- Discord bildirimi yalnızca BEKLEYEN yeni başvurular için gitsin.
-- Elenen (status='rejected') olarak eklenen kayıtlar — örneğin geçmiş
-- silmelerden geri yükleme — bildirim tetiklemez.
-- Form gönderimleri status belirtmez, varsayılan 'pending' olur, bildirim
-- almaya devam eder.
--
-- Supabase Dashboard > SQL Editor'de çalıştırın. Eklemeli/idempotent.
-- =====================================================================

drop trigger if exists trg_notify_migration_lead on migration_leads;
create trigger trg_notify_migration_lead
after insert on migration_leads
for each row
when (new.status is distinct from 'rejected')
execute function notify_migration_lead_webhook();

NOTIFY pgrst, 'reload schema';
