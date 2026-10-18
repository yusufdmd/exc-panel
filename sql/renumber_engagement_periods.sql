-- =====================================================================
-- EXC PANELİ — renumber_engagement_periods.sql
-- =====================================================================
-- Katılım yarışması dönem numaraları (seq) artık BOŞLUKSUZ ve sıralı:
-- bir dönem silindiğinde (ya da aktiviteden geri yüklendiğinde) tüm
-- dönemler başlangıç tarihine göre 1, 2, 3 ... diye yeniden numaralanır.
-- Ör. Dönem 1, 2, 3 varken 2 silinirse, 3 otomatik olarak Dönem 2 olur.
--
-- Bu, add_engagement_period_seq.sql'deki "silinen numara yeniden
-- kullanılmaz" kuralının YERİNE geçer (sayaç/sequence artık kullanılmıyor).
-- Hiçbir veri silinmez. Supabase Dashboard > SQL Editor'de bir kere
-- çalıştırın.
--
-- NOT: Daha önce Discord'a gönderilmiş panolardaki "Period N" yazıları
-- doğal olarak eski numarayla kalır.
-- =====================================================================

-- Yeni dönem: en büyük numaranın bir fazlası (sayaç yerine).
alter table engagement_periods alter column seq drop default;

create or replace function public.engagement_periods_set_seq()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seq is null then
    select coalesce(max(seq), 0) + 1 into new.seq from engagement_periods;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_engagement_periods_set_seq on engagement_periods;
create trigger trg_engagement_periods_set_seq
  before insert on engagement_periods
  for each row execute function public.engagement_periods_set_seq();

-- Silme/ekleme sonrası: başlangıç tarihine göre boşluksuz yeniden numarala.
-- Sadece numarası değişen satırlar güncellenir.
create or replace function public.engagement_periods_renumber()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with numbered as (
    select id, row_number() over (order by start_date, created_at, id) as rn
    from engagement_periods
  )
  update engagement_periods e
  set seq = n.rn
  from numbered n
  where e.id = n.id and e.seq is distinct from n.rn;
  return null;
end;
$$;

drop trigger if exists trg_engagement_periods_renumber on engagement_periods;
create trigger trg_engagement_periods_renumber
  after insert or delete on engagement_periods
  for each statement execute function public.engagement_periods_renumber();

-- Mevcut dönemleri şimdi bir kere düzelt (ör. Dönem 1, Dönem 4 -> Dönem 1, Dönem 2).
with numbered as (
  select id, row_number() over (order by start_date, created_at, id) as rn
  from engagement_periods
)
update engagement_periods e
set seq = n.rn
from numbered n
where e.id = n.id and e.seq is distinct from n.rn;

drop sequence if exists engagement_period_seq;

NOTIFY pgrst, 'reload schema';

-- Kontrol:
select seq, start_date, end_date from engagement_periods order by seq;
