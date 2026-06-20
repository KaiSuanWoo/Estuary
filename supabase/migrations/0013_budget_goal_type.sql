-- One-time "Goal" budgets: funded by individually-assigned transactions (not
-- categories), with a single "fund by" due date. Distinct from recurring budgets.

alter table public.budgets
  add column if not exists type text not null default 'recurring'
  check (type in ('recurring', 'goal'));

alter table public.budgets
  add column if not exists due_date date;

-- Which individual transactions fund a goal (expense = spent, else = saved).
create table if not exists public.budget_transaction_links (
  budget_id uuid not null references public.budgets(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (budget_id, transaction_id)
);

alter table public.budget_transaction_links enable row level security;

create policy "budget_transaction_links_select" on public.budget_transaction_links
  for select using ((select auth.uid()) = user_id);
create policy "budget_transaction_links_insert" on public.budget_transaction_links
  for insert with check ((select auth.uid()) = user_id);
create policy "budget_transaction_links_delete" on public.budget_transaction_links
  for delete using ((select auth.uid()) = user_id);

create index if not exists budget_transaction_links_budget_id_idx
  on public.budget_transaction_links(budget_id);
create index if not exists budget_transaction_links_transaction_id_idx
  on public.budget_transaction_links(transaction_id);
create index if not exists budget_transaction_links_user_id_idx
  on public.budget_transaction_links(user_id);
