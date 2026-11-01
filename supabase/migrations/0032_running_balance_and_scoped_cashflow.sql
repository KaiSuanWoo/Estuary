-- The running-balance column, and cashflow narrowed to one account.
--
-- `account_running_balance` replaces the last whole-ledger fetch on the
-- Activity list. That page is already paged and filtered server-side; it held
-- every transaction in memory for one column, shown only when a single account
-- is selected, because a balance derived from one page would have been wrong
-- the moment you scrolled. A window function answers it per account.
--
-- `cashflow_by_month` and `category_spend` take an optional account because
-- narrowing the book narrows what may cancel an expense, and that is not
-- something a caller can filter for after the fact — see below.

create or replace view public.account_running_balance
with (security_invoker = on) as
select
  t.id as transaction_id,
  t.user_id,
  a.id as account_id,
  t.date,
  round(
    a.opening_balance + sum(
      case
        when t.destination_account_id = a.id and t.type = 'transfer'
          then coalesce(t.destination_amount, t.amount)
        when t.type in ('income', 'adjustment') then  t.amount
        else                                         -t.amount
      end
    ) over (
      partition by a.id
      order by t.date, t.created_at
      rows between unbounded preceding and current row
    ), 2) as balance_after
from public.accounts a
join public.transactions t
  on t.account_id = a.id or t.destination_account_id = a.id
where t.user_id = a.user_id;

comment on view public.account_running_balance is
  'Balance immediately after each entry, per account, in that account''s own terms.';

-- ---------------------------------------------------------------------------
-- Income and expense per month over a range, optionally scoped to one account.
--
-- The two scope filters are deliberately different, and mirror the rule the
-- browser applied:
--
--   * an expense is netted only by repayments that landed *in this account* —
--     money repaid elsewhere never came back here, and this account is still
--     down it;
--   * a repayment stops counting as income only if the expense it covers is
--     also in scope — repaid into this account for something bought on
--     another, the money really did arrive, and cancelling it would lose it.
create or replace function public.cashflow_by_month(
  p_from    date,
  p_to      date,
  p_account uuid default null
) returns table (
  month         date,
  income_gross  numeric,
  expense_gross numeric,
  income_net    numeric,
  expense_net   numeric
)
language sql
stable
set search_path = ''
as $$
  with repaid as (
    select ra.expense_id, sum(ra.amount_base) as rb
      from public.reimbursement_allocation ra
     where p_account is null or ra.repayment_account_id = p_account
     group by ra.expense_id
  ),
  allocated as (
    select ra.repayment_id, sum(ra.amount) as ar
      from public.reimbursement_allocation ra
      join public.transactions e on e.id = ra.expense_id
     where p_account is null or e.account_id = p_account
     group by ra.repayment_id
  ),
  rows_ as (
    select
      date_trunc('month', t.date)::date as month,
      t.type,
      t.amount,
      g.gross_base,
      coalesce(r.rb, 0) as rb,
      a.ar,
      t.currency, t.fx_rate, t.date, t.user_id, s.base_currency
    from public.transactions t
    join public.settings s on s.user_id = t.user_id
    cross join lateral (
      select public.fx_to_base(t.user_id, t.amount, t.currency, s.base_currency,
                               t.fx_rate, t.date, false) as gross_base
    ) g
    left join repaid    r on r.expense_id   = t.id
    left join allocated a on a.repayment_id = t.id
    where t.type in ('expense', 'income')
      and not t.excluded_from_cashflow
      and t.date between p_from and p_to
      and (p_account is null or t.account_id = p_account)
  )
  select
    month,
    round(coalesce(sum(gross_base) filter (where type = 'income'),  0), 2),
    round(coalesce(sum(gross_base) filter (where type = 'expense'), 0), 2),
    round(coalesce(sum(
      case when type = 'income' then
        case when ar is null then gross_base
             when greatest(0, amount - ar) < 0.005 then 0
             else public.fx_to_base(user_id, greatest(0, amount - ar), currency,
                                    base_currency, fx_rate, date, false)
        end
      end), 0), 2),
    round(coalesce(sum(
      case when type = 'expense' then
        case when abs(gross_base - rb) < 0.005 then 0
             else greatest(0, gross_base - rb) end
      end), 0), 2)
  from rows_
  group by month
$$;

comment on function public.cashflow_by_month is
  'Income and expense per month over a range, optionally scoped to one account. Scoping narrows what may cancel an expense: a repayment into another account never came back here, so it must not net anything away.';

-- The same, grouped by category instead of by month.
create or replace function public.category_spend(
  p_from    date,
  p_to      date,
  p_account uuid default null
) returns table (
  category_id uuid,
  kind        text,
  gross       numeric,
  net         numeric
)
language sql
stable
set search_path = ''
as $$
  with repaid as (
    select ra.expense_id, sum(ra.amount_base) as rb
      from public.reimbursement_allocation ra
     where p_account is null or ra.repayment_account_id = p_account
     group by ra.expense_id
  ),
  allocated as (
    select ra.repayment_id, sum(ra.amount) as ar
      from public.reimbursement_allocation ra
      join public.transactions e on e.id = ra.expense_id
     where p_account is null or e.account_id = p_account
     group by ra.repayment_id
  ),
  rows_ as (
    select
      t.category_id, t.type, t.amount, g.gross_base,
      coalesce(r.rb, 0) as rb, a.ar,
      t.currency, t.fx_rate, t.date, t.user_id, s.base_currency
    from public.transactions t
    join public.settings s on s.user_id = t.user_id
    cross join lateral (
      select public.fx_to_base(t.user_id, t.amount, t.currency, s.base_currency,
                               t.fx_rate, t.date, false) as gross_base
    ) g
    left join repaid    r on r.expense_id   = t.id
    left join allocated a on a.repayment_id = t.id
    where t.type in ('expense', 'income')
      and not t.excluded_from_cashflow
      and t.date between p_from and p_to
      and (p_account is null or t.account_id = p_account)
  )
  select
    category_id,
    type,
    round(sum(gross_base), 2),
    round(sum(
      case when type = 'expense' then
             case when abs(gross_base - rb) < 0.005 then 0
                  else greatest(0, gross_base - rb) end
           when ar is null then gross_base
           when greatest(0, amount - ar) < 0.005 then 0
           else public.fx_to_base(user_id, greatest(0, amount - ar), currency,
                                  base_currency, fx_rate, date, false)
      end), 2)
  from rows_
  group by category_id, type
$$;

comment on function public.category_spend is
  'Per-category gross and net totals over a range, optionally scoped to one account. Net-mode callers drop rows whose net is zero — a fully repaid expense cost nothing and earns no place on a chart.';

grant select  on public.account_running_balance to authenticated;
grant execute on function public.cashflow_by_month to authenticated;
grant execute on function public.category_spend    to authenticated;
