-- =====================================================================
-- EXC PANELİ — add_engagement_period.sql
-- =====================================================================
-- "Katılım Yarışması" (EXC Engagement Challenge) için tek satırlık bir
-- dönem tablosu — sadece dönemin başlangıç tarihini tutar. Admin panelden
-- "Yeni Dönem Başlat" ile bu tarih bugüne güncellenir; SVS/SS/King of
-- Desert/GVG'nin ham haftalık verisine hiç dokunulmaz, sadece bu tarihten
-- sonraki haftalar yarışma puanına dahil edilir (bkz. js/engagement.js).
--
-- Supabase Dashboard > SQL Editor içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

create table if not exists engagement_period (
  id          smallint primary key default 1 check (id = 1),
  start_date  date not null default current_date,
  updated_at  timestamptz not null default now()
);

insert into engagement_period (id, start_date) values (1, current_date)
  on conflict (id) do nothing;

drop trigger if exists trg_engagement_period_updated_at on engagement_period;
create trigger trg_engagement_period_updated_at
  before update on engagement_period
  for each row execute function set_updated_at();

alter table engagement_period enable row level security;

-- Okuma: giriş yapmış herkese (admin + üye) açık — bu, viewer rolünün de
-- görebildiği "Etkinlikler" sekmesinin bir parçası.
drop policy if exists engagement_period_select_auth on engagement_period;
create policy engagement_period_select_auth on engagement_period
  for select using (auth.role() = 'authenticated');

-- Yazma: sadece admin ("Yeni Dönem Başlat" butonu).
drop policy if exists engagement_period_update_auth on engagement_period;
create policy engagement_period_update_auth on engagement_period
  for update using (auth.role() = 'authenticated' and public.current_user_role() = 'admin')
  with check (auth.role() = 'authenticated' and public.current_user_role() = 'admin');

alter publication supabase_realtime add table engagement_period;

NOTIFY pgrst, 'reload schema';
