-- =====================================================================
-- Hem Discord'daki /suggest-team-power'a opsiyonel bir "element" seçeneği,
-- hem de panelden (admin'in kendi yüklemesinde) bir element seçici
-- eklendi - oyuncunun/admin'in KENDİ beyan ettiği element, AI'nin ekran
-- görüntüsünden okuduğu elementten (team_element) AYRI saklanır ki admin
-- onay ekranında bir uyuşmazlık varsa uyarı olarak görebilsin
-- (bkz. js/teamPowerSuggestions.js). Boş bırakılabilir - hiç verilmezse
-- NULL kalır, uyuşmazlık kontrolü hiç yapılmaz.
-- =====================================================================

alter table team_power_suggestions
  add column if not exists claimed_element text check (claimed_element in ('water', 'fire', 'earth', 'electric'));

notify pgrst, 'reload schema';
