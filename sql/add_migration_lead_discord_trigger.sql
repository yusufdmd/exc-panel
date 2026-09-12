-- Genel siteden gelen göç başvurusu bildirimini artık TARAYICI değil,
-- Supabase'in kendisi gönderiyor. Tarayıcıdan (fetch/sendBeacon) atılan
-- ayrı bir istek, sekme kapanması/mobil ağ gibi durumlarda güvenilmez
-- çıktı (gerçek testlerde birçok kez sessizce hiç gönderilmedi) — bu
-- tetikleyici (trigger) migration_leads'e her INSERT olduğunda, bağlantı
-- durumundan tamamen bağımsız olarak sunucudan sunucuya çalışır.
--
-- pg_net uzantısı Supabase projelerinde varsayılan olarak kurulu gelir.
create extension if not exists pg_net;

create or replace function notify_migration_lead_webhook()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://exc-panel-6jgp.vercel.app/api/notify-migration-lead',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'name', new.name,
      'gameId', new.game_id,
      'contact', new.contact,
      'server', new.current_server::text,
      'power', new.power::text,
      'campLevel', new.camp_level,
      'teamPower', new.team_power::text,
      'teamElement', new.team_element,
      'message', new.message
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_migration_lead on migration_leads;
create trigger trg_notify_migration_lead
after insert on migration_leads
for each row
execute function notify_migration_lead_webhook();
