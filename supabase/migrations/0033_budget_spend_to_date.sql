-- Add the elapsed part of a budget's spend.
--
-- `spent` covers the whole window; `spent_to_date` stops at today. The run rate
-- needs the second: rent booked for the 28th is committed but has not happened,
-- and feeding it into a daily pace would imply you spend that much every day of
-- the month. `budgetMetrics` used to get this by filtering the ledger twice.
drop function if exists public.budget_spend(date);

create or replace function public.budget_spend(p_now date default current_date)
returns table (
  budget_id      uuid,
  window_from    date,
  window_to      date,
  spent          numeric,
  spent_to_date  numeric
)
language sql stable set search_path = '' as $$
  select
    b.id,
    lower(w.win),
    case when upper_inf(w.win) then null else (upper(w.win) - 1)::date end,
    greatest(0, round(coalesce(sum(
      case n.type when 'expense' then n.gross_base - n.repaid_base
                  when 'income'  then -n.gross_base
                  else 0 end
    ), 0), 2)),
    greatest(0, round(coalesce(sum(
      case when n.date <= p_now then
        case n.type when 'expense' then n.gross_base - n.repaid_base
                    when 'income'  then -n.gross_base
                    else 0 end
      end
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
  'Net spend per budget in its current window, plus the part already elapsed. Pass the reader''s local date so the window matches their calendar.';

grant execute on function public.budget_spend to authenticated;
