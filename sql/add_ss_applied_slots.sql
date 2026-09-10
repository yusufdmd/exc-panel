-- =====================================================================
-- EXC PANELİ — add_ss_applied_slots.sql
-- =====================================================================
-- SS (SandStorm) etkinliğinde loncanın oynadığı gerçek akışı yansıtır:
-- oyuncular bir haftada BİRDEN FAZLA saat dilimine ("1", "2", "3")
-- başvurabilir/oy verebilir, ama sonunda kontenjan (30 kişi) yüzünden
-- sadece BİR saat dilimine kesin listeye alınır. Önceden sadece "hangi
-- gruba (A/B) seçildi" tutuluyordu; başvurduğu ama seçilmediği haftalar
-- "hiç kayıt yok" ile aynı görünüyordu — bu üç yeni sütun, "başvurdu ama
-- kontenjan doldu" durumunu "hiç uğraşmadı"dan ayırt edilebilir yapar.
--
-- group_name sütunu artık 'A'/'B' yerine SEÇİLEN saat dilimini ('1'/'2'/'3')
-- tutar — eski 'A'/'B' değerleri (geçmiş haftalar) olduğu gibi kalır, kısıt
-- her ikisini de kabul edecek şekilde genişletildi.
--
-- Puanlama/katılım oranı hesaplarına HENÜZ dokunulmadı — sadece veri
-- toplama ve giriş ekranı güncellendi (bkz. js/events.js). Puanlama kuralı
-- netleştiğinde ayrı bir değişiklikle ele alınacak.
--
-- Supabase Dashboard > SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table ss_records add column if not exists applied_slot_1 boolean not null default false;
alter table ss_records add column if not exists applied_slot_2 boolean not null default false;
alter table ss_records add column if not exists applied_slot_3 boolean not null default false;

alter table ss_records drop constraint if exists ss_records_group_name_check;
alter table ss_records add constraint ss_records_group_name_check
  check (group_name in ('A','B','1','2','3') or group_name is null);

NOTIFY pgrst, 'reload schema';
