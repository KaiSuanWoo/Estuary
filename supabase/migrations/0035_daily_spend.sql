-- Spend per day over a range, for the cumulative-spend curve.
--
-- With `p_categories` given it answers the same question for one budget's
-- categories, which is what the Analytics budget drill-down needs to find the
-- day a budget crossed its limit. That used to be a fresh pass over the
-- period's transactions per budget, per render.
--
-- Income filed to a tracked category subtracts, because a refund into that
-- category reduces its spend. The subtraction is at face value, not net: a
-- refund is not a reimbursement, and netting it twice would double it.
create or replace function public.daily_spend(
  p_from       date,
  p_to         date,
  p_categories uuid[] default null
) returns table (
  day   date,
  gross numeric,
  net   numeric
)
language sql stable set search_path = '' as $$
  select
    n.date,
    round(coalesce(sum(
      case when n.type = 'expense' then n.gross_base
           when p_categories is not null and n.type = 'income' then -n.gross_base
      end), 0), 2),
    round(coalesce(sum(
      case when n.type = 'expense' then n.net_base
           when p_categories is not null and n.type = 'income' then -n.gross_base
      end), 0), 2)
  from public.transaction_net n
  where not n.excluded_from_cashflow
    and n.date between p_from and p_to
    and (
      p_categories is null
      or (n.category_id is not null and n.category_id = any(p_categories))
    )
  group by n.date
$$;

comment on function public.daily_spend is
  'Spend per day over a range, optionally restricted to a set of categories. Feeds the cumulative-spend curve and each budget''s crossing date.';

grant execute on function public.daily_spend to authenticated;
