-- =====================================================================
-- Göç adaylarına "kim ekledi / kim son düzenledi" bilgisi eklenir.
-- created_at zaten vardı ama panelde hiç gösterilmiyordu/düzenlenemiyordu
-- ve hangi admin'in eklediği hiç kaydedilmiyordu — bu da "bu adayı ben mi
-- ekledim, nereden geldi" karışıklığına yol açıyordu.
--
-- Hiçbir mevcut veri silinmez/değişmez; eski kayıtlarda created_by/
-- updated_by boş (NULL) kalır. Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

alter table migration_prospects add column if not exists created_by text;
alter table migration_prospects add column if not exists updated_by text;

NOTIFY pgrst, 'reload schema';
