-- =====================================================================
-- EXC PANELİ — auth_policies.sql
-- =====================================================================
-- init.sql'i çalıştırdıktan SONRA, Supabase Dashboard > SQL Editor'de
-- bunu da çalıştırın. Bu, "herkes okuyabilir ama sadece giriş yapmış
-- (admin) kullanıcılar yazabilir" modelini kurar:
--   - select (okuma) politikaları DEĞİŞMEZ, herkese açık kalır.
--   - insert/update/delete politikaları artık sadece Supabase Auth ile
--     giriş yapmış (authenticated) kullanıcılara izin verir.
--
-- Bunu çalıştırmadan önce en az bir yönetici hesabı oluşturun:
--   Supabase Dashboard > Authentication > Users > Add User
--   (Email + Password ile, "Auto Confirm User" işaretli)
-- Uygulamadaki "Giriş Yap" formuna bu email/şifreyi girerek admin
-- olarak oturum açabilirsiniz.
-- =====================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'members','power_history',
      'gvg_weeks','gvg_records',
      'svs_weeks','svs_records',
      'ss_weeks','ss_records',
      'other_weeks','other_records',
      'kod_weeks','kod_records',
      'migration_prospects',
      'settings','users','activity_logs'
    ])
  loop
    execute format('drop policy if exists %I on %I;', t || '_insert_all', t);
    execute format('drop policy if exists %I on %I;', t || '_insert_auth', t);
    execute format(
      'create policy %I on %I for insert with check (auth.role() = ''authenticated'');',
      t || '_insert_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_update_all', t);
    execute format('drop policy if exists %I on %I;', t || '_update_auth', t);
    execute format(
      'create policy %I on %I for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      t || '_update_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_delete_all', t);
    execute format('drop policy if exists %I on %I;', t || '_delete_auth', t);
    execute format(
      'create policy %I on %I for delete using (auth.role() = ''authenticated'');',
      t || '_delete_auth', t
    );
  end loop;
end $$;

-- =====================================================================
-- BİTTİ — select politikaları (herkes okuyabilir) init.sql'den olduğu
-- gibi kalır, burada dokunulmadı.
-- =====================================================================
