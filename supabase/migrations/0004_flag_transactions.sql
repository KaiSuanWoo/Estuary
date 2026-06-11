-- Flag transactions for later review.
alter table public.transactions
  add column if not exists flagged boolean not null default false;
