-- Reimbursements, resolved in the database.
--
-- This is the change the other aggregate views are waiting on. Every comment in
-- `analytics.ts` carries the same warning — "pass the FULL ledger here, never a
-- date- or account-filtered slice" — and the reason is this: a repayment filed
-- in March can cancel an expense booked in January, so no total could be
-- computed from a date range alone. That single coupling is why the browser
-- fetched 1,000+ rows to answer a question about one month, and why
-- `cashflowForRange` has to take the period slice and the whole ledger as two
-- separate arguments.
--
-- Resolving each expense's net cost once, here, dissolves it. Downstream, every
-- cashflow and category total becomes an ordinary `group by` over a date range.

-- ---------------------------------------------------------------------------
-- Conversion into a user's base currency.
--
-- Mirrors `amountInBase` in `src/lib/analytics.ts`, with one deliberate
-- improvement. The browser holds a single rate map — whatever today's rates
-- are — so an entry with no rate stamped on it converts at *today's* rate, and
-- a closed month quietly restates itself every time the market moves. That is
-- precisely what stamping `fx_rate` at entry was introduced to prevent; it just
-- never covered the rows that predate it.
--
-- So the fallback here is dated: the newest stored rate as at the entry's own
-- date, in either direction. Where nothing was recorded that early, the
-- earliest known rate stands in rather than the latest — an estimate from the
-- near side of the gap, and never silently dropping the amount from a total,
-- which returning null would do.
create or replace function public.fx_to_base(
  p_user        uuid,
  p_amount      numeric,
  p_currency    text,
  p_base        text,
  p_fx_rate     numeric,
  p_date        date,
  p_is_transfer boolean
) returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_amount is null or p_currency is null or p_base is null then null
    when p_currency = p_base then p_amount
    -- The rate stamped at entry. Never on a transfer: there `fx_rate` means
    -- source→destination, which is a different question entirely.
    when not p_is_transfer and p_fx_rate is not null and p_fx_rate > 0
      then p_amount * p_fx_rate
    else p_amount * coalesce(
      (select r.rate     from public.fx_rates r
        where r.user_id = p_user and r.base = p_currency and r.quote = p_base
          and r.rate > 0 and r.date <= p_date
        order by r.date desc limit 1),
      (select 1 / r.rate from public.fx_rates r
        where r.user_id = p_user and r.base = p_base and r.quote = p_currency
          and r.rate > 0 and r.date <= p_date
        order by r.date desc limit 1),
      (select r.rate     from public.fx_rates r
        where r.user_id = p_user and r.base = p_currency and r.quote = p_base
          and r.rate > 0
        order by r.date asc limit 1),
      (select 1 / r.rate from public.fx_rates r
        where r.user_id = p_user and r.base = p_base and r.quote = p_currency
          and r.rate > 0
        order by r.date asc limit 1)
    )
  end
$$;

comment on function public.fx_to_base is
  'Amount in the user''s base currency: the rate stamped at entry where there is one, else the stored rate as at the entry''s own date. Null when no rate is known in either direction. Reads fx_rates as the caller, so RLS scopes it.';

-- ---------------------------------------------------------------------------
-- One row per (repayment, expense) allocation.
--
-- The links live on the income side as a jsonb array — an expense has no record
-- of what paid it back — so this unnests them into rows that can be grouped
-- and joined. It stays a view rather than a table because the links are edited
-- as a unit on the income transaction; there is nothing here to keep in step.
--
-- `repayment_account_id` is carried deliberately. A per-account summary must
-- not net away an expense that was repaid into a *different* account: that
-- account is genuinely still down the money. Scoped callers filter on it;
-- unscoped ones ignore it.
create or replace view public.reimbursement_allocation
with (security_invoker = on) as
select
  t.user_id,
  (l->>'expense_id')::uuid as expense_id,
  t.id                     as repayment_id,
  t.account_id             as repayment_account_id,
  t.date                   as repayment_date,
  (l->>'amount')::numeric  as amount,
  public.fx_to_base(
    t.user_id, (l->>'amount')::numeric, t.currency, s.base_currency,
    t.fx_rate, t.date, false
  )                        as amount_base
from public.transactions t
join public.settings s on s.user_id = t.user_id
cross join lateral jsonb_array_elements(t.reimbursement_links) l
where t.type = 'income'
  and jsonb_typeof(t.reimbursement_links) = 'array'
  -- The same validation `reimbursementLinks()` applies: a usable id and a
  -- positive, finite amount. Anything else is not an allocation.
  and l->>'expense_id' is not null
  and l->>'expense_id' <> ''
  and (l->>'expense_id') ~ '^[0-9a-fA-F-]{36}$'
  and jsonb_typeof(l->'amount') = 'number'
  and (l->>'amount')::numeric > 0;

comment on view public.reimbursement_allocation is
  'One row per (repayment, expense) allocation, unnested from transactions.reimbursement_links, with the allocated amount in base currency.';

-- ---------------------------------------------------------------------------
-- Every transaction with its gross and net base-currency value.
--
-- `net_base` is the figure the cashflow and category views sum:
--   expense  — gross less everything repaid against it, floored at zero
--   income   — a repayment is not income, so only an unallocated surplus counts
--   other    — gross; transfers and adjustments are not cashflow
--
-- Amounts under half a cent are rounding dust rather than money: a fully
-- repaid expense has to net to *nothing*, not to a $0.00 sliver that still
-- earns its category a place on a chart. That is `isNegligible` in
-- `analytics.ts`, and it is applied at the same point here.
create or replace view public.transaction_net
with (security_invoker = on) as
with repaid as (
  select expense_id, sum(amount_base) as repaid_base
    from public.reimbursement_allocation
   group by expense_id
),
allocated as (
  select repayment_id, sum(amount) as allocated_raw
    from public.reimbursement_allocation
   group by repayment_id
)
select
  t.id,
  t.user_id,
  t.date,
  t.account_id,
  t.category_id,
  t.type,
  t.currency,
  t.amount,
  t.merchant,
  t.excluded_from_cashflow,
  s.base_currency,
  g.gross_base,
  coalesce(r.repaid_base, 0)   as repaid_base,
  coalesce(a.allocated_raw, 0) as allocated_raw,
  case
    when t.type = 'expense' then
      case when abs(g.gross_base - coalesce(r.repaid_base, 0)) < 0.005 then 0
           else greatest(0, g.gross_base - coalesce(r.repaid_base, 0))
      end
    when t.type = 'income' and a.allocated_raw is not null then
      case when greatest(0, t.amount - a.allocated_raw) < 0.005 then 0
           else public.fx_to_base(
                  t.user_id, greatest(0, t.amount - a.allocated_raw), t.currency,
                  s.base_currency, t.fx_rate, t.date, false)
      end
    else g.gross_base
  end as net_base
from public.transactions t
join public.settings s on s.user_id = t.user_id
left join repaid    r on r.expense_id   = t.id
left join allocated a on a.repayment_id = t.id
-- One `fx_to_base` call per row rather than five: the gross figure is the same
-- in every branch below, so it is computed once here and reused.
cross join lateral (
  select public.fx_to_base(
    t.user_id, t.amount, t.currency, s.base_currency,
    t.fx_rate, t.date, t.type = 'transfer'
  ) as gross_base
) g;

comment on view public.transaction_net is
  'Every transaction with gross_base and net_base (net of reimbursements) in the user''s base currency. The basis for every cashflow and category aggregate — it is what lets them be scoped to a date range.';

grant select on public.reimbursement_allocation to authenticated;
grant select on public.transaction_net to authenticated;
