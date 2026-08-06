-- =====================================================================
-- EXC PANELİ — auth_policies.sql
-- =====================================================================
-- init.sql'i çalıştırdıktan SONRA, Supabase Dashboard > SQL Editor'de
-- bunu da çalıştırın. Bu, "sadece giriş yapmış (admin) kullanıcılar
-- okuyabilir VE yazabilir" modelini kurar — üye/etkinlik/göç verileri
-- artık herkese açık DEĞİLDİR, sadece yöneticiler görebilir:
--   - select/insert/update/delete politikalarının hepsi artık sadece
--     Supabase Auth ile giriş yapmış (authenticated) kullanıcılara izin
--     verir.
--   - migration_leads BUNA DAHİL DEĞİLDİR — o tablonun "insert" politikası
--     bilerek herkese açık kalır (genel sitedeki "Göçe Katıl" formu
--     giriş yapmamış ziyaretçilerden başvuru alabilsin diye), "select"i
--     zaten en baştan sadece admin'e açıktı.
--   - Ana sayfadaki canlı üye sayısı için, tek bir sayıyı (isim/detay
--     olmadan) herkese açık döndüren ayrı bir fonksiyon
--     (get_active_member_count) bu dosyanın sonunda oluşturuluyor.
--
-- Bunu çalıştırmadan önce en az bir yönetici hesabı oluşturun:
--   Supabase Dashboard > Authentication > Users > Add User
--   (Email + Password ile, "Auto Confirm User" işaretli)
-- Uygulamadaki giriş ekranına bu email/şifreyi girerek admin olarak
-- oturum açabilirsiniz.
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
      'migration_periods','migration_prospects',
      'settings','users','activity_logs'
    ])
  loop
    execute format('drop policy if exists %I on %I;', t || '_select_all', t);
    execute format('drop policy if exists %I on %I;', t || '_select_auth', t);
    execute format(
      'create policy %I on %I for select using (auth.role() = ''authenticated'');',
      t || '_select_auth', t
    );

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

-- Ana sayfadaki canlı üye sayısı için: members tablosunun tamamına erişmeden,
-- sadece aktif (OLD/göç etmemiş) üye SAYISINI döndüren, herkese açık dar
-- kapsamlı bir fonksiyon. SECURITY DEFINER sayesinde RLS'i (yukarıdaki
-- kilit) bypass eder ama SADECE bu tek sayıyı döndürür — isim/ID/güç gibi
-- hiçbir ayrıntı dışarı sızmaz.
create or replace function public.get_active_member_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from members where not is_old and not is_migrated;
$$;

grant execute on function public.get_active_member_count() to anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- BİTTİ
-- =====================================================================
