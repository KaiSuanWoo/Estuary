-- Fixed vs discretionary classification for expense categories.
-- Fixed = contractual/unavoidable (rent, utilities); everything else is
-- discretionary — the controllable part of spend.
alter table public.categories
  add column if not exists is_fixed boolean not null default false;
