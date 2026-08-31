-- =====================================================================
-- Bir göç adayı "Tamamlandı" sekmesinden üye olarak eklendiğinde artık
-- migration_prospects kaydı SİLİNMEZ — admin kimin göç ettiğini orada
-- kalıcı olarak görebilsin diye bu sütun true olarak işaretlenir (bkz.
-- members.js -> saveMember). Aynı zamanda "Üye Olarak Onayla" butonunun
-- tekrar tıklanıp bir daha üye oluşturulmasını engellemek için de
-- kullanılır (bkz. migration.js -> renderMigration). Supabase Dashboard
-- > SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

alter table migration_prospects add column if not exists converted_to_member boolean not null default false;
