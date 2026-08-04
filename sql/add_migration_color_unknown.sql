-- "Unvan" seçeneklerine "Bilinmiyor" ekler — henüz değerlendirilmemiş
-- adaylar için. Yeni eklenen adaylar artık varsayılan olarak "Bilinmiyor"
-- ile başlar (önceden en düşük gerçek kademe olan "Gezgin"e düşüyordu,
-- ki bu bir değerlendirme yapılmış gibi yanıltıyordu).
alter table migration_prospects drop constraint if exists migration_prospects_color_check;
alter table migration_prospects add constraint migration_prospects_color_check check (color in ('gold','purple','blue','gray','unknown'));
alter table migration_prospects alter column color set default 'unknown';

NOTIFY pgrst, 'reload schema';
