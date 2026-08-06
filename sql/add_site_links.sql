-- Genel tanıtım sitesindeki Discord/YouTube/Instagram linklerini admin
-- panelinden düzenlenebilir yapar. Tek satırlık bir "ayarlar" tablosu
-- (id her zaman 1) — herkes okuyabilir (linkler zaten site üzerinde
-- görünür olacak), sadece admin güncelleyebilir.
create table if not exists site_links (
  id            int primary key default 1 check (id = 1),
  discord_url   text,
  youtube_url   text,
  instagram_url text,
  updated_at    timestamptz not null default now()
);

insert into site_links (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_site_links_updated_at on site_links;
create trigger trg_site_links_updated_at
  before update on site_links
  for each row execute function set_updated_at();

alter table site_links enable row level security;

drop policy if exists site_links_select_all on site_links;
create policy site_links_select_all on site_links for select using (true);

drop policy if exists site_links_update_auth on site_links;
create policy site_links_update_auth on site_links for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table site_links;

NOTIFY pgrst, 'reload schema';
