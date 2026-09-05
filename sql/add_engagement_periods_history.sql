-- =====================================================================
-- EXC PANELİ — add_engagement_periods_history.sql
-- =====================================================================
-- "Katılım Yarışması"nı tek satırlık bir "dönem başlangıcı" yerine,
-- migration_periods'a benzer ÇOK SATIRLI bir dönem geçmişine çevirir.
-- "Yeni Dönem Başlat" artık aktif dönemi (varsa) o anki sıralamayla
-- DONDURUP kapatır ve yeni bir aktif dönem açar — böylece geçmiş
-- dönemlerin kazananı kalıcı olarak, ileride bakılabilir şekilde saklanır.
--
-- Daha önce sql/add_engagement_period.sql'i çalıştırdıysanız (tekil
-- `engagement_period` tablosu), bu dosya oradaki başlangıç tarihini
-- yeni tabloya aktarıp eski tabloyu kaldırır. Hiç çalıştırmadıysanız da
-- sorun değil, bu dosya kendi kendine yeterlidir.
--
-- Supabase Dashboard > SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

create table if not exists engagement_periods (
  id          uuid primary key default gen_random_uuid(),
  start_date  date not null,
  end_date    date,              -- null = hâlâ aktif (devam ediyor); yeni dönem başlayınca doldurulur
  results     jsonb,             -- dönem kapatılırken donan sıralama (admin/üye adı/rütbe dahil) — null iken aktif demektir
  created_at  timestamptz not null default now()
);

create index if not exists idx_engagement_periods_start on engagement_periods (start_date desc);

-- Eski tekil tablo varsa, oradaki başlangıç tarihini yeni aktif dönem olarak taşı.
do $$
begin
  if to_regclass('public.engagement_period') is not null then
    insert into engagement_periods (start_date)
    select start_date from engagement_period
    where not exists (select 1 from engagement_periods);
    drop table engagement_period;
  end if;
end $$;

-- Hiç dönem yoksa (ilk kurulum), bugünü ilk aktif dönem olarak aç.
insert into engagement_periods (start_date)
select current_date
where not exists (select 1 from engagement_periods);

alter table engagement_periods enable row level security;

-- Okuma: giriş yapmış herkese (admin + üye) açık.
drop policy if exists engagement_periods_select_auth on engagement_periods;
create policy engagement_periods_select_auth on engagement_periods
  for select using (auth.role() = 'authenticated');

-- Yazma: sadece admin (yeni dönem açma / mevcut dönemi kapatıp dondurma).
drop policy if exists engagement_periods_insert_auth on engagement_periods;
create policy engagement_periods_insert_auth on engagement_periods
  for insert with check (auth.role() = 'authenticated' and public.current_user_role() = 'admin');

drop policy if exists engagement_periods_update_auth on engagement_periods;
create policy engagement_periods_update_auth on engagement_periods
  for update using (auth.role() = 'authenticated' and public.current_user_role() = 'admin')
  with check (auth.role() = 'authenticated' and public.current_user_role() = 'admin');

alter publication supabase_realtime add table engagement_periods;

NOTIFY pgrst, 'reload schema';
