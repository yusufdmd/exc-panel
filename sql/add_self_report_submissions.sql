-- =====================================================================
-- EXC PANELİ — add_self_report_submissions.sql
-- =====================================================================
-- Discord'daki "/report-participation" slash komutuyla oyuncuların kendi
-- ekran görüntülerini yüklemesiyle oluşan, bir AI'nin okuyup bir
-- admin/R4'ün onayını beklediği kayıtları tutar. Supabase Dashboard >
-- SQL Editor'de bir kere çalıştırın (panel kodunun yeni sürümünden
-- ÖNCE — yeni kod bu tabloyu okuyan bir admin bölümü içerir).
--
-- name_suggestions'ın aksine reddedilen kayıt SİLİNMEZ, status
-- 'rejected' olarak durur — katılım verisi hesap verebilirlik
-- gerektiriyor, sessizce kaybolmamalı.
--
-- Bu tabloya yazan tek yol Discord akışı (api/discord-interactions.js),
-- SERVICE ROLE anahtarıyla — oturum açmış bir panel kullanıcısı yok, bu
-- yüzden INSERT için ayrı bir RLS politikası yok (service role zaten
-- RLS'i bypass eder). Panel SADECE select/update (onay/red) için admin
-- politikası kullanır.
-- =====================================================================

create table if not exists self_report_submissions (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  discord_id    text not null,
  event_type    text not null check (event_type in ('svs','ss','kod','gvg','kodgvg')),
  week_id       uuid,
  image_url     text not null,
  ai_extracted  jsonb,
  ai_unmatched  boolean not null default false,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  reviewed_by   text,
  reviewed_at   timestamptz
);

create index if not exists idx_self_report_status on self_report_submissions (status, created_at desc);

alter table self_report_submissions enable row level security;

drop policy if exists self_report_select_admin on self_report_submissions;
create policy self_report_select_admin on self_report_submissions
  for select using (public.current_user_role() = 'admin');

drop policy if exists self_report_update_admin on self_report_submissions;
create policy self_report_update_admin on self_report_submissions
  for update using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

-- Realtime: bir R4 onayladığında/reddettiğinde diğer açık panel sekmeleri anında yenilensin.
do $$
begin
  alter publication supabase_realtime add table self_report_submissions;
exception when duplicate_object then null;
end $$;

NOTIFY pgrst, 'reload schema';
