-- =====================================================================
-- "AI Asistan" sekmesi — her admin'in KENDİ sohbet geçmişi. Diğer
-- adminler birbirinin mesajlarını göremez: RLS, author_id'yi giriş
-- yapan kullanıcının auth.uid()'siyle karşılaştırır (current_user_role()
-- için bkz. sql/add_member_role.sql — bu dosyadan SONRA çalıştırılmalı).
-- Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

create table if not exists ai_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ai_chat_messages_author on ai_chat_messages (author_id, created_at);

alter table ai_chat_messages enable row level security;

drop policy if exists ai_chat_select_own on ai_chat_messages;
create policy ai_chat_select_own on ai_chat_messages for select
  using (author_id = auth.uid() and public.current_user_role() = 'admin');

drop policy if exists ai_chat_insert_own on ai_chat_messages;
create policy ai_chat_insert_own on ai_chat_messages for insert
  with check (author_id = auth.uid() and public.current_user_role() = 'admin');

drop policy if exists ai_chat_delete_own on ai_chat_messages;
create policy ai_chat_delete_own on ai_chat_messages for delete
  using (author_id = auth.uid() and public.current_user_role() = 'admin');

-- Not: UPDATE politikası yoktur — mesajlar yazıldıktan sonra değişmez,
-- "Geçmişi Temizle" DELETE ile çalışır.

notify pgrst, 'reload schema';
