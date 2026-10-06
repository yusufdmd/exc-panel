-- =====================================================================
-- engagement_periods tablosunda silme (DELETE) politikası yoktu. Politika
-- olmayınca veritabanı hata vermeden hiçbir satır silmiyor, bu yüzden
-- silinen dönemler sayfa yenilenince geri geliyordu.
-- Yalnızca admin silebilir. Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

drop policy if exists engagement_periods_delete_admin on engagement_periods;
create policy engagement_periods_delete_admin on engagement_periods
  for delete
  using (public.current_user_role() = 'admin');

NOTIFY pgrst, 'reload schema';
