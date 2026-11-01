-- Budget spend, worked out in the database.
--
-- `budgetMetrics` was the most expensive thing the app did. Per budget it
-- walked the whole ledger twice for the headline figure, once more per category
-- for the breakdown, and once per cycle for the six history bars — about forty
-- full passes for four budgets, every render of the board and the dashboard.
-- All of it to produce one number per budget, per category and per month.
--
-- These are functions rather than views because the window depends on what day
-- it is *where the reader is*. `current_date` is the server's, in UTC: on the
-- first of the month in Sydney the server is still on the last of the previous
-- one, and a monthly budget would report the wrong window. The caller passes
-- its own local date.

-- The date window a budget rolls spend up over. Mirrors `budgetWindow` in
-- `src/lib/budgets.ts`: the current calendar period for weekly/monthly/yearly,
-- its own bounds for custom. A daterange carries the open-ended custom case
-- ("From March", "All time") without a special case at every use.
--
-- `date_trunc('week')` starts on Monday, which is what `startOfWeek(now,
-- { weekStartsOn: 1 })` asks for.
create or replace function public.budget_window(
  p_period text,
  p_start  date,
  p_end    date,
  p_now    date
) returns daterange
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'weekly' then daterange(
      date_trunc('week', p_now)::date,
      date_trunc('week', p_now)::date + 6, '[]')
    when 'yearly' then daterange(
      date_trunc('year', p_now)::date,
      (date_trunc('year', p_now) + interval '1 year' - interval '1 day')::date, '[]')
    when 'custom' then daterange(p_start, p_end, '[]')
    else daterange(
      date_trunc('month', p_now)::date,
      (date_trunc('month', p_now) + interval '1 month' - interval '1 day')::date, '[]')
  end
$$;

comment on function public.budget_window is
  'Inclusive date window a budget measures spend over, by period. Open-ended for a custom budget with an unset bound.';

-- ---------------------------------------------------------------------------
-- Net spend per budget in its current window.
--
-- Deliberately *not* a sum of `net_base`. `spendForBudget` floors only the
-- final total at zero, never the individual entry — an expense repaid for more
-- than it cost pushes the budget down, and a refund booked as income in the
-- same category subtracts. Summing a per-entry floored figure would quietly
-- lose both. So this sums `gross_base - repaid_base` and floors once, at the
-- end, exactly where the original did.
--
-- Two deliberate changes come with moving it here. Budgets now convert at the
-- rate stamped on the entry where there is one, like every other total in the
-- app — `spendForBudget` used the live rate alone, so a budget and the analytics
-- page could disagree about the same expense. And an entry excluded from
-- cashflow is now excluded from its budget too, which is what the flag says it
-- does; nothing is excluded today, so no current figure moves.
create or replace function public.budget_spend(p_now date default current_date)
returns table (
  budget_id   uuid,
  window_from date,
  window_to   date,
  spent       numeric
)
language sql
stable
set search_path = ''
as $$
  select
    b.id,
    lower(w.win),
    case when upper_inf(w.win) then null else (upper(w.win) - 1)::date end,
    greatest(0, round(coalesce(sum(
      case n.type when 'expense' then n.gross_base - n.repaid_base
                  when 'income'  then -n.gross_base
                  else 0 end
    ), 0), 2))
  from public.budgets b
  cross join lateral (
    select public.budget_window(b.period, b.start_date, b.end_date, p_now) as win
  ) w
  left join public.budget_category_links l on l.budget_id = b.id
  left join public.transaction_net n
         on n.user_id  = b.user_id
        and n.category_id = l.category_id
        and n.date <@ w.win
        and n.type in ('expense', 'income')
        and not n.excluded_from_cashflow
  group by b.id, w.win
$$;

comment on function public.budget_spend is
  'Net spend per budget in its current window, base currency. Pass the reader''s local date so the window matches their calendar.';

-- Per-category spend inside each budget — the breakdown rows on the board.
-- One query in place of one full ledger pass per category per budget.
create or replace function public.budget_category_spend(p_now date default current_date)
returns table (
  budget_id   uuid,
  category_id uuid,
  spent       numeric
)
language sql
stable
set search_path = ''
as $$
  select
    b.id,
    l.category_id,
    greatest(0, round(coalesce(sum(
      case n.type when 'expense' then n.gross_base - n.repaid_base
                  when 'income'  then -n.gross_base
                  else 0 end
    ), 0), 2))
  from public.budgets b
  join public.budget_category_links l on l.budget_id = b.id
  cross join lateral (
    select public.budget_window(b.period, b.start_date, b.end_date, p_now) as win
  ) w
  left join public.transaction_net n
         on n.user_id  = b.user_id
        and n.category_id = l.category_id
        and n.date <@ w.win
        and n.type in ('expense', 'income')
        and not n.excluded_from_cashflow
  group by b.id, l.category_id
$$;

comment on function public.budget_category_spend is
  'Spend per category within each budget, for the current window.';

-- The closed windows behind the history bars, for every monthly budget at once.
-- Only monthly budgets have comparable past windows worth charting, which is
-- what `cycleStarts` decided by returning an empty list for everything else.
create or replace function public.budget_cycles(
  p_months integer default 6,
  p_now    date default current_date
) returns table (
  budget_id uuid,
  month     date,
  spent     numeric
)
language sql
stable
set search_path = ''
as $$
  select
    b.id,
    m.month,
    greatest(0, round(coalesce(sum(
      case n.type when 'expense' then n.gross_base - n.repaid_base
                  when 'income'  then -n.gross_base
                  else 0 end
    ), 0), 2))
  from public.budgets b
  cross join lateral (
    select (date_trunc('month', p_now) - make_interval(months => g))::date as month
      from generate_series(0, greatest(p_months, 1) - 1) g
  ) m
  left join public.budget_category_links l on l.budget_id = b.id
  left join public.transaction_net n
         on n.user_id  = b.user_id
        and n.category_id = l.category_id
        and n.date >= m.month
        and n.date <  (m.month + interval '1 month')::date
        and n.type in ('expense', 'income')
        and not n.excluded_from_cashflow
  where b.period = 'monthly'
  group by b.id, m.month
$$;

comment on function public.budget_cycles is
  'Spend per closed monthly window per budget, newest month first in date terms. Monthly budgets only — nothing else has comparable past windows.';

grant execute on function public.budget_window  to authenticated;
grant execute on function public.budget_spend   to authenticated;
grant execute on function public.budget_category_spend to authenticated;
grant execute on function public.budget_cycles  to authenticated;
