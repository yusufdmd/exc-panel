-- =====================================================================
-- Göç sekmesine yeni bir ara aşama ekler: "Tamamlandı". "Onayda" (confirmed)
-- artık sadece "doğrulandı, göç edecek" anlamına gelir — HANGİ loncaya
-- gideceği belli değildir (birden fazla lonca aday olabilir). "Tamamlandı"
-- ise "kesinlikle BİZE (EXC'ye) katılacak" anlamına gelir — sadece o
-- aşamadan "Üye Olarak Onayla" ile gerçek üyeliğe dönüştürülebilir (bkz.
-- migration.js -> markProspectFinalized/approveProspect). Supabase
-- Dashboard > SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists finalized boolean not null default false;
