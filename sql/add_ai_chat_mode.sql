-- =====================================================================
-- AI Asistan'da "Metin" (Gemini sohbeti) ve "Görsel" (Cloudflare üretimi)
-- sohbetlerini birbirinden ayırmak için her mesaja hangi modda
-- yazıldığını kaydeden bir sütun ekler. Supabase Dashboard > SQL
-- Editor'de, sql/add_ai_chat_messages.sql'den SONRA çalıştırın.
-- =====================================================================

alter table ai_chat_messages add column if not exists mode text not null default 'text' check (mode in ('text', 'image'));

-- Geriye dönük düzeltme: content'i data:image/ ile başlayan satırlar zaten
-- görsel mesajlardır — bunları "image" işaretle, ve her birini üreten hemen
-- önceki kullanıcı mesajını (varsa) da aynı moda çek.
update ai_chat_messages set mode = 'image' where content like 'data:image/%';

update ai_chat_messages u
set mode = 'image'
from ai_chat_messages a
where a.mode = 'image'
  and u.author_id = a.author_id
  and u.role = 'user'
  and u.created_at = (
    select max(u2.created_at) from ai_chat_messages u2
    where u2.author_id = a.author_id and u2.role = 'user' and u2.created_at < a.created_at
  );

notify pgrst, 'reload schema';
