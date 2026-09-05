-- =====================================================================
-- Üye (viewer) rolündeki kullanıcıların, üye listesinde bir satırın
-- yanındaki "✏️ İsim Değişikliği Öner" ile gönderdiği isim değişikliği
-- önerileri. Herkes tek bir paylaşılan "viewer" girişini kullandığı için
-- öneriyi GERÇEKTEN o kişinin yazıp yazmadığı teknik olarak doğrulanamaz
-- — bu yüzden admin onayı zorunludur (bkz. migration_leads ile aynı
-- "yetkisiz gönderim -> admin onayı" deseni). Onaylanınca üyenin adı
-- gerçekten değişir ve mevcut "önceki isimler" geçmişine eklenir (bkz.
-- members.js -> approveNameSuggestion). Supabase Dashboard > SQL Editor
-- içine yapıştırıp çalıştırın (tek seferlik).
-- =====================================================================

create table if not exists name_suggestions (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid references members(id) on delete cascade,
  old_name        text, -- öneri anındaki ad (üyenin adı o sırada değişse/silinse bile öneri anlamlı kalsın diye)
  suggested_name  text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_name_suggestions_created on name_suggestions (created_at desc);

alter table name_suggestions enable row level security;

-- Giriş yapan herkes (admin + viewer) öneri gönderebilir.
drop policy if exists name_suggestions_insert_auth on name_suggestions;
create policy name_suggestions_insert_auth on name_suggestions for insert with check (auth.role() = 'authenticated');

-- Sadece admin görebilir ve silebilir (onaylama/reddetme = silme, bkz. migration_leads deseniyle aynı).
drop policy if exists name_suggestions_select_admin on name_suggestions;
create policy name_suggestions_select_admin on name_suggestions for select using (public.current_user_role() = 'admin');

drop policy if exists name_suggestions_delete_admin on name_suggestions;
create policy name_suggestions_delete_admin on name_suggestions for delete using (public.current_user_role() = 'admin');

alter publication supabase_realtime add table name_suggestions;
