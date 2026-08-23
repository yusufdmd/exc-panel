-- Ana sayfadaki "YouTube Kanalımız" bölümünde dönen video vitrini:
-- herkes okuyabilir, sadece admin ekleyip/düzenleyip/silebilir.
-- Video görselleri YouTube'un kendi thumbnail URL'lerinden (img.youtube.com)
-- çekilir, ayrı bir dosya yüklemesi gerekmez — sadece video linki tutulur.

create table if not exists featured_videos (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,
  title         text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_featured_videos_sort on featured_videos (sort_order asc, created_at desc);

drop trigger if exists trg_featured_videos_updated_at on featured_videos;
create trigger trg_featured_videos_updated_at
  before update on featured_videos
  for each row execute function set_updated_at();

alter table featured_videos enable row level security;

drop policy if exists featured_videos_select_all on featured_videos;
create policy featured_videos_select_all on featured_videos for select using (true);

drop policy if exists featured_videos_insert_auth on featured_videos;
create policy featured_videos_insert_auth on featured_videos for insert with check (auth.role() = 'authenticated');

drop policy if exists featured_videos_update_auth on featured_videos;
create policy featured_videos_update_auth on featured_videos for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists featured_videos_delete_auth on featured_videos;
create policy featured_videos_delete_auth on featured_videos for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table featured_videos;

NOTIFY pgrst, 'reload schema';
