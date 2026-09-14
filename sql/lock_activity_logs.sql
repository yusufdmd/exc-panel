-- "Aktivite" kayıtlarını (activity_logs) GERÇEKTEN değiştirilemez/silinemez
-- yapar. init.sql'deki genel RLS döngüsü bu tabloya da (diğerleriyle
-- birlikte) update/delete izni veriyordu — yani teknik olarak, panel
-- arayüzünü hiç kullanmadan Supabase'e doğrudan istek atan biri "silindi"
-- kayıtlarını (ve içindeki geri yükleme anlık görüntülerini) yok edebilirdi.
-- Bu, sadece select + insert bırakıp update/delete politikalarını kaldırır
-- — artık hiçbir rol (admin dahil) bir aktivite kaydını değiştiremez/silemez.
drop policy if exists activity_logs_update_all on activity_logs;
drop policy if exists activity_logs_delete_all on activity_logs;
