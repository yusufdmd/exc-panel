-- =====================================================================
-- Üyeler sayfasından (Discord'a ek olarak) admin'in kendisinin ekran
-- görüntüsü yükleyip bir üyenin 1. Takım gücü/elementi için öneri
-- oluşturabilmesi. Daha önce bu tabloya SADECE service role (Discord
-- akışı) yazabiliyordu - şimdi admin oturumu da yazabilir (viewer DEĞİL,
-- bu özellik admin-only, bkz. panel/index.html -> admin-only class).
-- Supabase Dashboard > SQL Editor'de, add_team_power_suggestions.sql'den
-- SONRA çalıştırın.
-- =====================================================================

-- Panelden (admin bizzat) gelen önerilerde Discord ID yok - bu yüzden
-- artık zorunlu değil (self_report_submissions'ta daha önce yapılan
-- AYNI düzeltme, bkz. sql/add_self_report_site_upload.sql).
alter table team_power_suggestions alter column discord_id drop not null;

drop policy if exists team_power_suggestions_insert_admin on team_power_suggestions;
create policy team_power_suggestions_insert_admin on team_power_suggestions
  for insert with check (public.current_user_role() = 'admin');

notify pgrst, 'reload schema';
