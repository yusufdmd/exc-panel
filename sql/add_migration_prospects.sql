-- Mevcut (zaten canlıda olan) veritabanına "Göç" sekmesi için gereken
-- tabloyu ekler: önümüzdeki göç dönemi için bize katılmak isteyen
-- adayların listesi. members tablosundan bağımsızdır (adaylar henüz
-- üye değildir). RLS ve realtime, init.sql/auth_policies.sql'deki diğer
-- tablolarla aynı modeli (herkes okur, sadece giriş yapmış admin yazar)
-- doğrudan burada kurar çünkü bu tablo o dosyalar ilk çalıştırıldığında
-- henüz yoktu.

create table if not exists migration_prospects (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  game_id     text,
  power       bigint not null default 0,
  server      bigint, -- adayın şu an hangi sunucuda olduğu
  color       text not null default 'gray' check (color in ('gold','purple','blue','gray')), -- göç rengi: Altın > Mor > Mavi > Gri
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_migration_prospects_color on migration_prospects (color);

drop trigger if exists trg_migration_prospects_updated_at on migration_prospects;
create trigger trg_migration_prospects_updated_at
  before update on migration_prospects
  for each row execute function set_updated_at();

alter table migration_prospects enable row level security;

drop policy if exists migration_prospects_select_all on migration_prospects;
create policy migration_prospects_select_all on migration_prospects for select using (true);

drop policy if exists migration_prospects_insert_auth on migration_prospects;
create policy migration_prospects_insert_auth on migration_prospects for insert with check (auth.role() = 'authenticated');

drop policy if exists migration_prospects_update_auth on migration_prospects;
create policy migration_prospects_update_auth on migration_prospects for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists migration_prospects_delete_auth on migration_prospects;
create policy migration_prospects_delete_auth on migration_prospects for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table migration_prospects;

NOTIFY pgrst, 'reload schema';
