-- =====================================================================
-- Panel üzerinden (Discord'a ek olarak) kendi kendine katılım bildirme.
-- Oyuncu, giriş yapılmış panelde (admin VEYA viewer - loncanın paylaşılan
-- girişi) Etkinlikler sekmesindeki "📸 Katılımını Bildir" ile kendi adını
-- roster'dan seçip bir ekran görüntüsü yükler. Bu site kaynaklı
-- kayıtların Discord ID'si olmaz, bu yüzden o sütun artık zorunlu değil.
-- Supabase Dashboard > SQL Editor'de, add_self_report_submissions.sql'den
-- SONRA çalıştırın.
-- =====================================================================

alter table self_report_submissions alter column discord_id drop not null;

-- Daha önce bu tabloya SADECE service role (Discord akışı) yazabiliyordu.
-- Artık panelde giriş yapmış herkes (admin + viewer) de yazabilir - hangi
-- üye adına gönderildiği, formda admin/viewer'ın SEÇTİĞİ member_id ile
-- belirlenir (gerçek bir kimlik doğrulaması değil, Discord akışındaki
-- "AI roster'da eşleştirir" güven seviyesiyle aynı - son söz yine admin onayı).
drop policy if exists self_report_insert_authenticated on self_report_submissions;
create policy self_report_insert_authenticated on self_report_submissions
  for insert with check (auth.role() = 'authenticated');

-- Ekran görüntülerini saklamak için yeni bucket - news-images ile aynı
-- desen (herkese açık okuma, sadece giriş yapmış kullanıcı yükleyebilir).
insert into storage.buckets (id, name, public)
values ('self-report-images', 'self-report-images', true)
on conflict (id) do nothing;

drop policy if exists self_report_images_select_all on storage.objects;
create policy self_report_images_select_all on storage.objects
  for select using (bucket_id = 'self-report-images');

drop policy if exists self_report_images_insert_auth on storage.objects;
create policy self_report_images_insert_auth on storage.objects
  for insert with check (bucket_id = 'self-report-images' and auth.role() = 'authenticated');

notify pgrst, 'reload schema';
