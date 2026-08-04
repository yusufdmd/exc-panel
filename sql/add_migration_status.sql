-- Göç adaylarına, bize "kesin" mi yoksa "belirsiz" mi geleceklerine dair
-- bir durum alanı ekler (Göç Planı özelliği).
alter table migration_prospects add column if not exists status text not null default 'uncertain' check (status in ('certain','uncertain'));

NOTIFY pgrst, 'reload schema';
