-- Ana sayfadaki "Haberler" bölümü: herkes okuyabilir, sadece admin
-- ekleyip/düzenleyip/silebilir. Resimler Supabase Storage'daki
-- "news-images" adlı herkese açık (okuma) bucket'ta tutulur.

create table if not exists news (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text,
  image_url     text,
  published_at  date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_news_published on news (published_at desc);

drop trigger if exists trg_news_updated_at on news;
create trigger trg_news_updated_at
  before update on news
  for each row execute function set_updated_at();

alter table news enable row level security;

drop policy if exists news_select_all on news;
create policy news_select_all on news for select using (true);

drop policy if exists news_insert_auth on news;
create policy news_insert_auth on news for insert with check (auth.role() = 'authenticated');

drop policy if exists news_update_auth on news;
create policy news_update_auth on news for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists news_delete_auth on news;
create policy news_delete_auth on news for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table news;

-- Storage bucket + politikaları
insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do nothing;

drop policy if exists news_images_select_all on storage.objects;
create policy news_images_select_all on storage.objects for select using (bucket_id = 'news-images');

drop policy if exists news_images_insert_auth on storage.objects;
create policy news_images_insert_auth on storage.objects for insert with check (bucket_id = 'news-images' and auth.role() = 'authenticated');

drop policy if exists news_images_update_auth on storage.objects;
create policy news_images_update_auth on storage.objects for update using (bucket_id = 'news-images' and auth.role() = 'authenticated') with check (bucket_id = 'news-images' and auth.role() = 'authenticated');

drop policy if exists news_images_delete_auth on storage.objects;
create policy news_images_delete_auth on storage.objects for delete using (bucket_id = 'news-images' and auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
