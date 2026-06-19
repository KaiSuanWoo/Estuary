-- Budgets become named "budget categories" (envelopes) that group one or more
-- transaction categories. A 'limit' counts down monthly; a 'goal' counts up
-- toward a target over an optional date range. This replaces the old per-category
-- monthly_budget / budget_domain and the tag-scoped goals.

alter table public.budgets
  add column if not exists kind text not null default 'limit'
  check (kind in ('limit', 'goal'));

-- Pre-existing dated goals become kind='goal'
update public.budgets set kind = 'goal' where end_date is not null;

-- Tag scoping is replaced by category membership
alter table public.budgets drop column if exists tag_id;

-- Many-to-many: which transaction categories roll up into which budget
create table if not exists public.budget_category_links (
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (budget_id, category_id)
);

alter table public.budget_category_links enable row level security;

create policy "budget_category_links_select" on public.budget_category_links
  for select using ((select auth.uid()) = user_id);
create policy "budget_category_links_insert" on public.budget_category_links
  for insert with check ((select auth.uid()) = user_id);
create policy "budget_category_links_delete" on public.budget_category_links
  for delete using ((select auth.uid()) = user_id);

create index if not exists budget_category_links_budget_id_idx
  on public.budget_category_links(budget_id);
create index if not exists budget_category_links_category_id_idx
  on public.budget_category_links(category_id);
create index if not exists budget_category_links_user_id_idx
  on public.budget_category_links(user_id);

-- Per-category budgeting is superseded by budget categories
alter table public.categories drop column if exists monthly_budget;
alter table public.categories drop column if exists budget_domain;
