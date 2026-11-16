-- =====================================================================
-- "📸 Takım Gücü Ekle" artık sadece admin'e değil, panelde giriş yapmış
-- HERKESE (admin + viewer, loncanın paylaşılan girişi) açık - self-report
-- ile AYNI güven modeli: oyuncu kendi adını roster'dan seçer, admin yine
-- de onaylar/düzeltir (bkz. js/teamPowerUpload.js, kullanıcı talebi).
-- Daha önceki admin-only politikanın (add_team_power_suggestions_insert.sql)
-- YERİNE geçer. Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

drop policy if exists team_power_suggestions_insert_admin on team_power_suggestions;
drop policy if exists team_power_suggestions_insert_authenticated on team_power_suggestions;
create policy team_power_suggestions_insert_authenticated on team_power_suggestions
  for insert with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
