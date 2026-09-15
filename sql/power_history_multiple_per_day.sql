-- =====================================================================
-- EXC PANELİ — power_history_multiple_per_day.sql
-- =====================================================================
-- Şimdiye kadar power_history ve team_power_history günde tek satır
-- tutuyordu (unique(member_id, history_date)) — aynı gün içinde ikinci
-- bir güç değişikliği yapıldığında, önceki değer geçmişten SİLİNİP
-- üzerine yazılıyordu (ör. 388 -> 433 -> 434 aynı gün yapılırsa sadece
-- 434 kalıyordu). Artık her farklı değer kendi satırı olarak saklanıyor
-- (bkz. js/database.js -> addPowerHistoryEntry/addTeamPowerHistoryEntry,
-- artık upsert değil düz insert; js/members.js -> saveMember artık asla
-- var olan bir satırın üzerine yazmıyor, her zaman yeni satır ekliyor).
--
-- init.sql ve add_team_power_history.sql daha önce çalıştırıldıysa,
-- bunu Supabase Dashboard > SQL Editor'de bir kere çalıştırın. Sadece
-- kısıtı kaldırır, mevcut veriyi değiştirmez/silmez — kendi kendine
-- yeterlidir.
-- =====================================================================

alter table power_history drop constraint if exists power_history_member_id_history_date_key;
alter table team_power_history drop constraint if exists team_power_history_member_id_history_date_key;

NOTIFY pgrst, 'reload schema';
