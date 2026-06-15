-- Goal / envelope budgets (e.g. "Japan 2026: $3,000"), scoped to a tag.
-- Spend = sum of tagged transactions within the optional date window.
create table public.budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  amount     numeric not null check (amount > 0),
  tag_id     uuid references public.tags (id) on delete set null,
  start_date date,
  end_date   date,
  color      text,
  created_at timestamptz not null default now()
);

alter table public.budgets enable row level security;
create policy budgets_owner on public.budgets
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index budgets_user_id_idx on public.budgets (user_id);
create index budgets_tag_id_idx on public.budgets (tag_id);
