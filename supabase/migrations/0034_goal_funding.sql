-- What a goal budget has been funded by.
--
-- A goal is funded by named transactions rather than by category, so this joins
-- the link table instead of taking a date window. `goalFunding` used to scan
-- the whole ledger looking for a handful of assigned ids.
--
-- `spent` is floored at zero and `saved` is not, which is how it behaved: money
-- put aside is money put aside, while an over-repaid expense should not credit
-- the goal.
create or replace function public.goal_funding()
returns table (
  budget_id uuid,
  spent     numeric,
  saved     numeric
)
language sql stable set search_path = '' as $$
  select
    b.id,
    greatest(0, round(coalesce(sum(
      case when n.type = 'expense' then n.gross_base - n.repaid_base end
    ), 0), 2)),
    round(coalesce(sum(
      case when n.type <> 'expense' then n.gross_base end
    ), 0), 2)
  from public.budgets b
  join public.budget_transaction_links l on l.budget_id = b.id
  left join public.transaction_net n on n.id = l.transaction_id
  where b.type = 'goal'
  group by b.id
$$;

comment on function public.goal_funding is
  'Spent and saved per goal budget, from the transactions assigned to it.';

grant execute on function public.goal_funding to authenticated;
