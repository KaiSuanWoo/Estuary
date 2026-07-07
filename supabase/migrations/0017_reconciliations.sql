-- Statement reconciliation checkpoints: "bank says X, Estuary computed Y".
-- One row per check; the latest row per account is the reconciled state.
create table if not exists public.reconciliations (
  id               uuid        not null default gen_random_uuid() primary key,
  user_id          uuid        not null references auth.users(id) on delete cascade,
  account_id       uuid        not null references public.accounts(id) on delete cascade,
  date             date        not null,
  stated_balance   numeric     not null,
  computed_balance numeric     not null,
  difference       numeric     not null,
  created_at       timestamptz not null default now()
);

create index if not exists reconciliations_user_idx on public.reconciliations(user_id);
create index if not exists reconciliations_account_idx on public.reconciliations(account_id);

alter table public.reconciliations enable row level security;

create policy "reconciliations_select_own"
  on public.reconciliations for select using ((select auth.uid()) = user_id);
create policy "reconciliations_insert_own"
  on public.reconciliations for insert with check ((select auth.uid()) = user_id);
create policy "reconciliations_delete_own"
  on public.reconciliations for delete using ((select auth.uid()) = user_id);
