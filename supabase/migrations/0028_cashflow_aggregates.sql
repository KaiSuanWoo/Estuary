-- Cashflow and category totals, grouped in the database.
--
-- These replace the passes the browser was making over the full ledger. On the
-- Analytics page alone there were roughly eighty-five of them per render —
-- `monthlyCashflow` walked the ledger twice per month for six months,
-- `savingsRateSeries` twice per month for twelve, `categoryAnomalies` twice per
-- month for seven, and each of those rebuilt the same reimbursement map first.
-- The cost grew as ledger × history, so it got worse in both directions at once.
--
-- Both cashflow modes are returned side by side rather than as a parameter: the
-- toggle on the page is instant and the extra four numbers per month cost
-- nothing. "gross" is face value; "net" is reimbursement-aware, which is what
-- `transaction_net` has already worked out.

-- Every month the ledger has an entry in — including transfer-only months,
-- which carry no cashflow but are still months you can open and look at.
create or replace view public.ledger_months
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', date)::date as month,
  count(*) as entries
from public.transactions
group by user_id, date_trunc('month', date);

comment on view public.ledger_months is
  'Months the ledger has any entry in, with a count. Replaces building a Set over every row client-side.';

-- Income and expense per calendar month, both modes, base currency.
create or replace view public.monthly_cashflow
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', date)::date as month,
  round(coalesce(sum(gross_base) filter (where type = 'income'),  0), 2) as income_gross,
  round(coalesce(sum(gross_base) filter (where type = 'expense'), 0), 2) as expense_gross,
  round(coalesce(sum(net_base)   filter (where type = 'income'),  0), 2) as income_net,
  round(coalesce(sum(net_base)   filter (where type = 'expense'), 0), 2) as expense_net
from public.transaction_net
where not excluded_from_cashflow
  and type in ('expense', 'income')
group by user_id, date_trunc('month', date);

comment on view public.monthly_cashflow is
  'Per-month income and expense in base currency, gross and net of reimbursements. Serves the dashboard trend, the savings-rate series and the month-end projection.';

-- Expense and income per category per month.
--
-- Carries ids, not names and colours: the categories table is 48 rows and
-- already cached on the client, so joining it here would only make the payload
-- bigger. `category_id` is null for unfiled entries, which is the
-- "Uncategorised" slice.
--
-- A row can legitimately read net = 0 with gross > 0 — an expense repaid in
-- full cost nothing. Net-mode consumers drop those, the same way
-- `spendingByCategory` drops a slice whose net is negligible; gross-mode
-- consumers keep them.
create or replace view public.category_spend_by_month
with (security_invoker = on) as
select
  user_id,
  date_trunc('month', date)::date as month,
  category_id,
  type as kind,
  round(sum(gross_base), 2) as gross,
  round(sum(net_base), 2)   as net,
  count(*)                  as entries
from public.transaction_net
where not excluded_from_cashflow
  and type in ('expense', 'income')
group by user_id, date_trunc('month', date), category_id, type;

comment on view public.category_spend_by_month is
  'Per-category, per-month totals in base currency, gross and net. Serves the breakdown donut, category movers and the anomaly check.';

grant select on public.ledger_months to authenticated;
grant select on public.monthly_cashflow to authenticated;
grant select on public.category_spend_by_month to authenticated;
