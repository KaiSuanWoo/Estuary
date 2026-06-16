-- Classify budgeted categories into spend domains so budgets can be grouped:
--   fixed    — predictable monthly costs (rent, subscriptions)
--   variable — discretionary spend (food, shopping)
--   savings  — money set aside toward a target (counts up, not down)
alter table public.categories
  add column if not exists budget_domain text
  check (budget_domain in ('fixed', 'variable', 'savings'));
