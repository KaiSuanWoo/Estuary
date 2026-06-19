-- Split a budget's behaviour into two independent dimensions:
--   direction — expense (counts down) vs saving (counts up)
--   period    — weekly | monthly | yearly | custom (start_date/end_date)
-- Replaces the combined `kind` (limit/goal).

alter table public.budgets
  add column if not exists direction text not null default 'expense'
    check (direction in ('expense', 'saving'));

alter table public.budgets
  add column if not exists period text not null default 'monthly'
    check (period in ('weekly', 'monthly', 'yearly', 'custom'));

-- Backfill from the old kind
update public.budgets set direction = 'expense', period = 'monthly' where kind = 'limit';
update public.budgets set direction = 'saving',  period = 'custom'  where kind = 'goal';

alter table public.budgets drop column if exists kind;
