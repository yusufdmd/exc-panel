-- =====================================================================
-- Katılım yarışması dönemlerine sıra numarası (1. Dönem, 2. Dönem ...).
-- Numara bir sayaçtan (sequence) gelir: silinen bir dönemin numarası
-- yeniden kullanılmaz; yeni dönem her zaman en büyük numaranın bir fazlasını alır.
-- Mevcut dönemler başlangıç tarihine göre 1'den numaralandırılır.
-- Hiçbir veri silinmez. Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

create sequence if not exists engagement_period_seq;

alter table engagement_periods add column if not exists seq integer;

with numbered as (
  select id, row_number() over (order by start_date) as rn
  from engagement_periods
)
update engagement_periods e
set seq = n.rn
from numbered n
where e.id = n.id and e.seq is null;

select setval('engagement_period_seq', coalesce((select max(seq) from engagement_periods), 0) + 1, false);

alter table engagement_periods alter column seq set default nextval('engagement_period_seq');

NOTIFY pgrst, 'reload schema';
