-- Shared snapshot table for external investment/portfolio data (Zenith).
-- One row per (user, source); Zenith upserts its portfolio total + a small
-- per-account breakdown, Estuary reads it for combined net worth.
create table if not exists public.investment_snapshots (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  source        text        not null default 'zenith',
  base_currency text        not null,
  total         numeric     not null default 0,
  as_of         timestamptz,
  accounts      jsonb       not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (user_id, source)
);

alter table public.investment_snapshots enable row level security;

create policy "investment_snapshots_select_own"
  on public.investment_snapshots for select
  using ((select auth.uid()) = user_id);

create policy "investment_snapshots_insert_own"
  on public.investment_snapshots for insert
  with check ((select auth.uid()) = user_id);

create policy "investment_snapshots_update_own"
  on public.investment_snapshots for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "investment_snapshots_delete_own"
  on public.investment_snapshots for delete
  using ((select auth.uid()) = user_id);
