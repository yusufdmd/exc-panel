-- =====================================================================
-- TEK SEFERLİK: Daha önce ✕ ile silinen göç başvurularını (Aktivite
-- kaydında action='deleted' olarak duran, tam kopyası saklı olanları)
-- "Elenenler" listesine geri ekler. Panel yalnızca son 200 aktiviteyi
-- gösterdiği için tüm geçmişi burada, veritabanında tarıyoruz.
--
-- - Zaten migration_leads'te olan bir id atlanır (çift kayıt olmaz).
-- - Aynı başvuru birden çok kez silinmişse en son kopya kullanılır.
-- - Eklenen kayıtlar status='rejected' olur; sonradan Elenenler'den
--   kalıcı silinebilirler.
-- - Eski kopyalarda başvuru tarihi saklı değil; created_at olarak silinme
--   zamanı yazılır.
--
-- Supabase Dashboard > SQL Editor'de BİR KEZ çalıştırın.
-- =====================================================================

insert into migration_leads
  (id, name, game_id, contact, current_server, power, camp_level, team_power, team_element, message, color, status, created_at)
select distinct on (x.id)
  x.id,
  coalesce(x.name, 'İsimsiz'),
  x.game_id, x.contact, x.current_server, x.power, x.camp_level, x.team_power, x.team_element, x.message, x.color,
  'rejected',
  x.deleted_at
from (
  select
    (a.details->'snapshot'->>'id')::uuid                 as id,
    a.details->'snapshot'->>'name'                       as name,
    a.details->'snapshot'->>'game_id'                    as game_id,
    a.details->'snapshot'->>'contact'                    as contact,
    (a.details->'snapshot'->>'current_server')::bigint   as current_server,
    (a.details->'snapshot'->>'power')::bigint            as power,
    a.details->'snapshot'->>'camp_level'                 as camp_level,
    (a.details->'snapshot'->>'team_power')::bigint       as team_power,
    a.details->'snapshot'->>'team_element'               as team_element,
    a.details->'snapshot'->>'message'                    as message,
    a.details->'snapshot'->>'color'                      as color,
    a.created_at                                         as deleted_at
  from activity_logs a
  where a.action = 'deleted'
    and a.entity_type = 'migration_lead'
    and a.details->'snapshot' is not null
    and a.details->'snapshot'->>'id' is not null
) x
where not exists (select 1 from migration_leads l where l.id = x.id)
order by x.id, x.deleted_at desc
on conflict (id) do nothing;
