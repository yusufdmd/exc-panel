-- =====================================================================
-- "Üye" (viewer) rolü — Üyeler/Etkinlikler/Puan Sıralamasını görebilen ama
-- hiçbir şeyi düzenleyemeyen, Göç/Aktivite/Site verilerini hiç göremeyen
-- üçüncü bir giriş katmanı. Supabase Dashboard > SQL Editor'de çalıştırın.
--
-- ÖNEMLİ SIRA: Bu SQL çalıştırılmadan panel koduna güncelleme YAPILMAMALI —
-- kod, bu dosyanın oluşturduğu current_user_role() fonksiyonuna bağımlı.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Giriş yapan kullanıcının rolünü döndüren yardımcı fonksiyon.
--    `users` tablosunda eşleşen bir kayıt yoksa (mevcut TÜM admin
--    hesapları böyledir — bu tablo şimdiye kadar hiç kullanılmamıştı)
--    geriye dönük uyumluluk için 'admin' varsayılır.
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from users where auth_user_id = auth.uid() limit 1),
    'admin'
  );
$$;

grant execute on function public.current_user_role() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Üye/etkinlik verisi: OKUMA giriş yapan herkese (admin + üye) açık,
--    YAZMA sadece admin'e açık.
-- ---------------------------------------------------------------------
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
      'kod_weeks','kod_records'
    ])
  loop
    execute format('drop policy if exists %I on %I;', t || '_select_auth', t);
    execute format(
      'create policy %I on %I for select using (auth.role() = ''authenticated'');',
      t || '_select_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_insert_auth', t);
    execute format(
      'create policy %I on %I for insert with check (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'');',
      t || '_insert_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_update_auth', t);
    execute format(
      'create policy %I on %I for update using (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'') with check (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'');',
      t || '_update_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_delete_auth', t);
    execute format(
      'create policy %I on %I for delete using (auth.role() = ''authenticated'' and public.current_user_role() = ''admin'');',
      t || '_delete_auth', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) Tamamen admin-only kalması gereken tablolar: göç, aktivite, ayarlar,
--    kullanıcı listesi — "üye" rolü bunları hiç OKUYAMAZ bile.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'migration_periods','migration_prospects',
      'settings','users','activity_logs'
    ])
  loop
    execute format('drop policy if exists %I on %I;', t || '_select_auth', t);
    execute format(
      'create policy %I on %I for select using (public.current_user_role() = ''admin'');',
      t || '_select_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_insert_auth', t);
    execute format(
      'create policy %I on %I for insert with check (public.current_user_role() = ''admin'');',
      t || '_insert_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_update_auth', t);
    execute format(
      'create policy %I on %I for update using (public.current_user_role() = ''admin'') with check (public.current_user_role() = ''admin'');',
      t || '_update_auth', t
    );

    execute format('drop policy if exists %I on %I;', t || '_delete_auth', t);
    execute format(
      'create policy %I on %I for delete using (public.current_user_role() = ''admin'');',
      t || '_delete_auth', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) migration_leads: genel siteden herkese açık INSERT aynen kalır,
--    SELECT/DELETE artık sadece admin.
-- ---------------------------------------------------------------------
drop policy if exists migration_leads_select_auth on migration_leads;
create policy migration_leads_select_auth on migration_leads for select using (public.current_user_role() = 'admin');

drop policy if exists migration_leads_delete_auth on migration_leads;
create policy migration_leads_delete_auth on migration_leads for delete using (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------
-- 5) site_links: herkese açık SELECT aynen kalır, UPDATE artık sadece admin.
-- ---------------------------------------------------------------------
drop policy if exists site_links_update_auth on site_links;
create policy site_links_update_auth on site_links for update using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------
-- 6) news: herkese açık SELECT aynen kalır, INSERT/UPDATE/DELETE artık
--    sadece admin.
-- ---------------------------------------------------------------------
drop policy if exists news_insert_auth on news;
create policy news_insert_auth on news for insert with check (public.current_user_role() = 'admin');

drop policy if exists news_update_auth on news;
create policy news_update_auth on news for update using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

drop policy if exists news_delete_auth on news;
create policy news_delete_auth on news for delete using (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------
-- 7) news-images Storage bucket: herkese açık SELECT aynen kalır,
--    INSERT/UPDATE/DELETE artık sadece admin.
-- ---------------------------------------------------------------------
drop policy if exists news_images_insert_auth on storage.objects;
create policy news_images_insert_auth on storage.objects for insert with check (bucket_id = 'news-images' and public.current_user_role() = 'admin');

drop policy if exists news_images_update_auth on storage.objects;
create policy news_images_update_auth on storage.objects for update using (bucket_id = 'news-images' and public.current_user_role() = 'admin') with check (bucket_id = 'news-images' and public.current_user_role() = 'admin');

drop policy if exists news_images_delete_auth on storage.objects;
create policy news_images_delete_auth on storage.objects for delete using (bucket_id = 'news-images' and public.current_user_role() = 'admin');

NOTIFY pgrst, 'reload schema';
