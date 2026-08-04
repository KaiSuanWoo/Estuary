-- Portfolio value over time.
--
-- `investment_snapshots` holds one row per source and is overwritten on every
-- push, so it can answer "what is it worth now" but never "how has it moved".
-- This keeps one point per day per source: the sync appends today's value, and
-- Zenith backfills the history it has already been keeping.
--
-- Daily granularity with the date in the key, so several pushes in one day
-- settle on the last value rather than piling up.
create table if not exists public.investment_history (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  source        text        not null default 'zenith',
  date          date        not null,
  total         numeric     not null,
  base_currency text        not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, source, date)
);

create index if not exists investment_history_user_date_idx
  on public.investment_history (user_id, source, date);

alter table public.investment_history enable row level security;

create policy "investment_history_select_own"
  on public.investment_history for select
  using ((select auth.uid()) = user_id);

create policy "investment_history_insert_own"
  on public.investment_history for insert
  with check ((select auth.uid()) = user_id);

create policy "investment_history_update_own"
  on public.investment_history for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "investment_history_delete_own"
  on public.investment_history for delete
  using ((select auth.uid()) = user_id);
