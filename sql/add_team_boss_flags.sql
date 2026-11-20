-- =====================================================================
-- EXC PANELİ — add_team_boss_flags.sql
-- =====================================================================
-- Araştırma ağacından açılabilen 2 opsiyonel takım boss'u: "Sky-Held Hawk"
-- (saldırı) ve "Ophidillain" (savunma). Element boss'u (her elementin
-- zaten kendi boss'u oluyor) otomatik olduğu için ayrıca takip edilmiyor
-- — sadece bu 2 OPSİYONEL boss işaretleniyor (kullanıcı talebi).
--
-- İstatistiksel bir katkı hesaplanamıyor (oyun bunu ayrı bir sayı olarak
-- göstermiyor), bu yüzden sadece "var/yok" bilgisi tutuluyor — admin elle
-- işaretleyebilir VEYA oyuncu takım gücü ekran görüntüsü gönderirken
-- kendi beyan eder (team_power/team_element ile AYNI tam-üzerine-yazma
-- deseni: her yeni onaylanan öneri, üyenin mevcut bayraklarının TAMAMINI
-- değiştirir — "belirtilmedi" diye bir ara durum yok, bkz. js/teamPowerUpload.js).
-- =====================================================================

alter table members
  add column if not exists has_hawk_boss boolean not null default false,
  add column if not exists has_snake_boss boolean not null default false;

alter table team_power_suggestions
  add column if not exists hawk_boss boolean not null default false,
  add column if not exists snake_boss boolean not null default false;

notify pgrst, 'reload schema';
