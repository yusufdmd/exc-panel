-- =====================================================================
-- EXC PANELİ — Supabase PostgreSQL Şeması
-- =====================================================================
-- Bu dosyayı Supabase Dashboard > SQL Editor içine yapıştırıp çalıştırın.
-- Baştan sona tek seferde çalıştırılacak şekilde tasarlanmıştır.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Gerekli eklentiler
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0.1) Ortak "updated_at" otomatik güncelleme fonksiyonu
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =====================================================================
-- 1) MEMBERS — Üyeler
-- =====================================================================
create table if not exists members (
  id                  uuid primary key default gen_random_uuid(),
  name                text, -- göç eden üyelerde bilinmeyebilir, bu yüzden NOT NULL değil
  game_id             text, -- aynı sebeple NOT NULL değil
  rank                text not null check (rank in ('R5','R4','R3','R2','R1')),
  camp_level          text not null default '1',
  power               bigint not null default 0,
  is_old              boolean not null default false,
  old_since           date,
  is_migrated         boolean not null default false, -- true ise bu üye başka bir sunucuya göç etmiştir ("Göç Edenler" sekmesi)
  migrated_to_server  bigint, -- göç ettiği sunucu biliniyorsa (opsiyonel)
  name_history        jsonb not null default '[]'::jsonb, -- [{name, changedAt}, ...] eski kullanıcı adları
  joined_at           timestamptz not null default now(),
  user_changed_at     timestamptz, -- hesabı devralan yeni kullanıcının başlangıç tarihi (bkz. add_user_changed_at.sql); doluysa muafiyet eşiği joined_at yerine bunu esas alır
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_members_is_old      on members (is_old);
create index if not exists idx_members_is_migrated on members (is_migrated);
create index if not exists idx_members_rank        on members (rank);

drop trigger if exists trg_members_updated_at on members;
create trigger trg_members_updated_at
  before update on members
  for each row execute function set_updated_at();

-- =====================================================================
-- 2) POWER_HISTORY — Güç seviyesi geçmişi (grafik/tablo için)
--    (Mevcut uygulamadaki "Güç Geçmişi" özelliğini korumak için eklendi)
-- =====================================================================
create table if not exists power_history (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  history_date  date not null,
  power         bigint not null,
  created_at    timestamptz not null default now(),
  unique (member_id, history_date)
);

create index if not exists idx_power_history_member on power_history (member_id);

-- =====================================================================
-- 3) GVG — Haftalık puan etkinliği
-- =====================================================================
create table if not exists gvg_weeks (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  week_date   date,
  created_at  timestamptz not null default now()
);

create table if not exists gvg_records (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references gvg_weeks(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  points      bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, member_id)
);

create index if not exists idx_gvg_records_week   on gvg_records (week_id);
create index if not exists idx_gvg_records_member on gvg_records (member_id);

drop trigger if exists trg_gvg_records_updated_at on gvg_records;
create trigger trg_gvg_records_updated_at
  before update on gvg_records
  for each row execute function set_updated_at();

-- =====================================================================
-- 4) SVS — Katıldı / Katılmadı / Bilgi Yok + Puan + Mazeret
-- =====================================================================
create table if not exists svs_weeks (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  week_date   date,
  created_at  timestamptz not null default now()
);

create table if not exists svs_records (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references svs_weeks(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  status      text not null default 'unknown' check (status in ('joined','absent','unknown')),
  points      bigint not null default 0,
  excused     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, member_id)
);

create index if not exists idx_svs_records_week   on svs_records (week_id);
create index if not exists idx_svs_records_member on svs_records (member_id);

drop trigger if exists trg_svs_records_updated_at on svs_records;
create trigger trg_svs_records_updated_at
  before update on svs_records
  for each row execute function set_updated_at();

-- =====================================================================
-- 5) SS — A/B Grup + Katıldı mı + Mazeret
-- =====================================================================
create table if not exists ss_weeks (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  week_date   date,
  created_at  timestamptz not null default now()
);

create table if not exists ss_records (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references ss_weeks(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  group_name  text check (group_name in ('A','B') or group_name is null),
  attended    boolean not null default false,
  excused     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, member_id)
);

create index if not exists idx_ss_records_week   on ss_records (week_id);
create index if not exists idx_ss_records_member on ss_records (member_id);

drop trigger if exists trg_ss_records_updated_at on ss_records;
create trigger trg_ss_records_updated_at
  before update on ss_records
  for each row execute function set_updated_at();

-- =====================================================================
-- 6) OTHER — "Diğer Etkinlik" (serbest isimli, SVS ile aynı mantık)
--    (Mevcut uygulamadaki "Diğer" sekmesini korumak için eklendi)
-- =====================================================================
create table if not exists other_weeks (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  week_date   date,
  created_at  timestamptz not null default now()
);

create table if not exists other_records (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references other_weeks(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  status      text not null default 'unknown' check (status in ('joined','absent','unknown')),
  points      bigint not null default 0,
  excused     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, member_id)
);

create index if not exists idx_other_records_week   on other_records (week_id);
create index if not exists idx_other_records_member on other_records (member_id);

drop trigger if exists trg_other_records_updated_at on other_records;
create trigger trg_other_records_updated_at
  before update on other_records
  for each row execute function set_updated_at();

-- =====================================================================
-- 6.1) KOD — King of Desert (SVS/Diğer'den farkı: puan tutulmaz, sadece
--      katıldı/katılmadı/bilgi yok + mazeret)
-- =====================================================================
create table if not exists kod_weeks (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  week_date   date,
  created_at  timestamptz not null default now()
);

create table if not exists kod_records (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references kod_weeks(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  status      text not null default 'unknown' check (status in ('joined','absent','unknown')),
  excused     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (week_id, member_id)
);

create index if not exists idx_kod_records_week   on kod_records (week_id);
create index if not exists idx_kod_records_member on kod_records (member_id);

drop trigger if exists trg_kod_records_updated_at on kod_records;
create trigger trg_kod_records_updated_at
  before update on kod_records
  for each row execute function set_updated_at();

-- =====================================================================
-- 6.2) MIGRATION_PERIODS — Göç dönemleri (iki haftalık göç pencereleri).
--      Etkinlik haftalarının aksine EN YENİ ÖNCE sıralanır (bkz. database.js
--      -> getMigrationPeriods), çünkü kullanıcı her zaman güncel dönemi
--      ilk görmek ister.
-- =====================================================================
create table if not exists migration_periods (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  period_date date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_migration_periods_updated_at on migration_periods;
create trigger trg_migration_periods_updated_at
  before update on migration_periods
  for each row execute function set_updated_at();

-- =====================================================================
-- 6.3) MIGRATION_PROSPECTS — "Göç" sekmesi: önümüzdeki göç dönemi için
--      bize katılmak isteyen adaylar. members'dan bağımsızdır, ait
--      olduğu döneme migration_periods üzerinden bağlanır.
-- =====================================================================
create table if not exists migration_prospects (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid references migration_periods(id) on delete cascade,
  name        text,
  game_id     text,
  power       bigint not null default 0,
  server      bigint, -- adayın şu an hangi sunucuda olduğu
  color       text not null default 'unknown' check (color in ('gold','purple','blue','gray','unknown')), -- göç unvanı: Altın > Mor > Mavi > Gri > Bilinmiyor
  status      text not null default 'uncertain' check (status in ('certain','uncertain')), -- bize kesin mi belirsiz mi geleceği (Göç Planı)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_migration_prospects_color on migration_prospects (color);
create index if not exists idx_migration_prospects_period on migration_prospects (period_id);

drop trigger if exists trg_migration_prospects_updated_at on migration_prospects;
create trigger trg_migration_prospects_updated_at
  before update on migration_prospects
  for each row execute function set_updated_at();

-- =====================================================================
-- 6.4) MIGRATION_LEADS — genel tanıtım sitesindeki "Göçe Katıl" formundan
--      gelen, sunucu dışından herkesin gönderebildiği ham başvurular.
--      Sadece admin görebilir; onaylanınca migration_prospects'e
--      dönüştürülür (bkz. panel/js/migration.js -> processLead).
-- =====================================================================
create table if not exists migration_leads (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  game_id        text,
  contact        text,
  current_server bigint,
  power          bigint,
  message        text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_migration_leads_created on migration_leads (created_at desc);

-- NOT: migration_leads BİLEREK aşağıdaki 10) bölümündeki genel RLS
-- döngüsüne (ve auth_policies.sql'e) dahil EDİLMEZ — çünkü o döngü
-- insert'i sonunda sadece giriş yapmış kullanıcıya kısıtlar, ama bu
-- tablonun tüm amacı GİRİŞ YAPMAMIŞ ziyaretçilerin form gönderebilmesi.
-- Bu yüzden kendi özel politikalarını burada, doğrudan tanımlıyoruz.
alter table migration_leads enable row level security;

drop policy if exists migration_leads_insert_public on migration_leads;
create policy migration_leads_insert_public on migration_leads for insert with check (true);

drop policy if exists migration_leads_select_auth on migration_leads;
create policy migration_leads_select_auth on migration_leads for select using (auth.role() = 'authenticated');

drop policy if exists migration_leads_delete_auth on migration_leads;
create policy migration_leads_delete_auth on migration_leads for delete using (auth.role() = 'authenticated');

-- =====================================================================
-- 7) SETTINGS — Uygulama geneli ayarlar (anahtar/değer)
-- =====================================================================
create table if not exists settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_settings_updated_at on settings;
create trigger trg_settings_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- =====================================================================
-- 8) USERS — Liderler / gelecekteki giriş sistemi için
-- =====================================================================
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  display_name  text,
  role          text not null default 'leader' check (role in ('admin','leader','viewer')),
  auth_user_id  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_login    timestamptz
);

-- =====================================================================
-- 9) ACTIVITY_LOGS — Kim, ne zaman, neyi değiştirdi
-- =====================================================================
create table if not exists activity_logs (
  id           uuid primary key default gen_random_uuid(),
  actor        text not null default 'leader',
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_activity_logs_created on activity_logs (created_at desc);
create index if not exists idx_activity_logs_entity   on activity_logs (entity_type, entity_id);

-- =====================================================================
-- 10) ROW LEVEL SECURITY
-- =====================================================================
-- NOT: Eski window.storage (shared:true) modeli, linki bilen herkesin
-- veriyi görüp düzenleyebildiği açık bir modeldi. Aynı davranışı korumak
-- için RLS açık ama tüm rollere (anon + authenticated) tam yetki veren
-- politikalar tanımlanıyor. İleride "users" tablosu gerçek girişe
-- bağlandığında bu politikalar sıkılaştırılabilir.

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
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists %I on %I;', t || '_select_all', t);
    execute format(
      'create policy %I on %I for select using (true);',
      t || '_select_all', t
    );

    execute format('drop policy if exists %I on %I;', t || '_insert_all', t);
    execute format(
      'create policy %I on %I for insert with check (true);',
      t || '_insert_all', t
    );

    execute format('drop policy if exists %I on %I;', t || '_update_all', t);
    execute format(
      'create policy %I on %I for update using (true) with check (true);',
      t || '_update_all', t
    );

    execute format('drop policy if exists %I on %I;', t || '_delete_all', t);
    execute format(
      'create policy %I on %I for delete using (true);',
      t || '_delete_all', t
    );
  end loop;
end $$;

-- =====================================================================
-- 11) REALTIME — Değişiklikleri anlık dinleyebilmek için
-- =====================================================================
alter publication supabase_realtime add table
  members, power_history,
  gvg_weeks, gvg_records,
  svs_weeks, svs_records,
  ss_weeks, ss_records,
  other_weeks, other_records,
  kod_weeks, kod_records,
  migration_periods, migration_prospects, migration_leads,
  settings, activity_logs;

-- =====================================================================
-- BİTTİ
-- =====================================================================
