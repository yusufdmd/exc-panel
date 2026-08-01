-- Mevcut (zaten canlıda olan) veritabanına "Kullanıcı Değişti" tarihini
-- eklemek için tek seferlik migrasyon. Bu tarih dolduğunda, o üyenin
-- muafiyet eşiği (isExempt) joined_at yerine bunu esas alır — yani hesabı
-- devralan yeni kişi, kendinden önceki etkinliklerden otomatik muaf sayılır.
alter table members add column if not exists user_changed_at timestamptz;

NOTIFY pgrst, 'reload schema';
