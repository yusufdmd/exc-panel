-- Genel tanıtım sitesindeki "Göçe Katıl" formu için: sunucu dışından
-- (giriş yapmamış) herkesin gönderebildiği, ama sadece adminin
-- görebildiği ham başvuru kutusu. Buradaki bir başvuru, admin panelde
-- "İşle" ile onaylanan bir göç adayına (migration_prospects) dönüştürülür
-- — migration_prospects'in kendisi HİÇBİR ZAMAN herkese açık yazılabilir
-- olmaz, spam/kötüye kullanım riskine karşı bu ayrım bilerek yapılmıştır.
create table if not exists migration_leads (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact        text, -- Discord kullanıcı adı vb. (opsiyonel)
  current_server bigint,
  power          bigint,
  message        text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_migration_leads_created on migration_leads (created_at desc);

alter table migration_leads enable row level security;

drop policy if exists migration_leads_insert_public on migration_leads;
create policy migration_leads_insert_public on migration_leads for insert with check (true);

drop policy if exists migration_leads_select_auth on migration_leads;
create policy migration_leads_select_auth on migration_leads for select using (auth.role() = 'authenticated');

drop policy if exists migration_leads_delete_auth on migration_leads;
create policy migration_leads_delete_auth on migration_leads for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table migration_leads;

NOTIFY pgrst, 'reload schema';
