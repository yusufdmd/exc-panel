-- =====================================================================
-- TEK SEFERLİK VERİ DÜZELTMESİ (şema değişikliği değildir, init.sql'e
-- eklenmez): "Tamamlandı" geçmişi özelliği eklenmeden ÖNCE üye olarak
-- eklenmiş 5 kişinin migration_prospects kaydı, o zamanki eski davranış
-- (silme) yüzünden kaybolmuştu. Bu betik onları Dönem 4'e, mevcut üye
-- kayıtlarındaki güncel güç/kamp/takım bilgileriyle, "Tamamlandı" +
-- "Üye Oldu" olarak geri ekler. Supabase Dashboard > SQL Editor içine
-- yapıştırıp çalıştırın — birden fazla kez çalıştırmak güvenlidir
-- (zaten eklenmiş olanları tekrar eklemez).
-- =====================================================================

do $$
declare
  v_period_id uuid;
begin
  select id into v_period_id from migration_periods where label = 'Dönem 4' limit 1;
  if v_period_id is null then
    raise exception 'Dönem 4 bulunamadı — dönem etiketini kontrol edin.';
  end if;

  insert into migration_prospects (period_id, name, game_id, power, color, status, camp_level, team_power, team_element, confirmed, finalized, converted_to_member)
  select
    v_period_id, m.name, m.game_id, m.power, 'unknown', 'certain', m.camp_level, m.team_power, m.team_element,
    true, true, true
  from members m
  where m.game_id in ('224319969979853', '224318906695696', '224319969979172', '224318365892705', '224319975194628')
    and not exists (
      select 1 from migration_prospects mp where mp.period_id = v_period_id and mp.game_id = m.game_id
    );
end $$;
