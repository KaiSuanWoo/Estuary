-- Balances belong to the database.
--
-- They were derived in the browser: fetch every transaction, fold them up on
-- each render. That makes the answer depend on how much of the ledger the
-- client managed to fetch, and PostgREST caps an unbounded select at 1000 rows
-- without saying so — past a thousand entries the oldest rows dropped off and
-- every account drifted, because the earliest rows carry the opening period's
-- income and inbound transfers. It also means the whole ledger crosses the
-- wire to answer a question that is one number per pocket.
--
-- This view answers it where the rows already are. It mirrors
-- `accountBalancesByCurrency` exactly, minus the Zenith override, which is
-- layered on client-side because it comes from a snapshot rather than the
-- ledger: each declared pocket's opening figure, plus every transaction
-- counted under its own currency, plus the landing leg of a transfer counted
-- under the currency it arrived as.

create or replace view public.account_balances
with (security_invoker = on) as
with
-- Every (account, currency) that should report a balance: the pockets an
-- account declares, plus any currency that actually moved through it.
keys as (
  select c.user_id, c.account_id, c.currency
    from public.account_currencies c
   where not c.is_archived
  union
  select t.user_id, t.account_id, coalesce(nullif(t.currency, ''), a.currency)
    from public.transactions t
    join public.accounts a on a.id = t.account_id
  union
  select t.user_id, t.destination_account_id,
         coalesce(nullif(t.destination_currency, ''), d.currency)
    from public.transactions t
    join public.accounts d on d.id = t.destination_account_id
   where t.type = 'transfer' and t.destination_account_id is not null
),
-- Money leaving or landing, in the currency it moved as. Amounts are stored
-- positive; `type` carries the sign.
movements as (
  select t.account_id,
         coalesce(nullif(t.currency, ''), a.currency) as currency,
         sum(case t.type
               when 'income'     then  t.amount
               when 'adjustment' then  t.amount
               when 'expense'    then -t.amount
               when 'transfer'   then -t.amount
             end) as delta
    from public.transactions t
    join public.accounts a on a.id = t.account_id
   group by t.account_id, coalesce(nullif(t.currency, ''), a.currency)
  union all
  select t.destination_account_id,
         coalesce(nullif(t.destination_currency, ''), d.currency),
         sum(coalesce(t.destination_amount, t.amount))
    from public.transactions t
    join public.accounts d on d.id = t.destination_account_id
   where t.type = 'transfer' and t.destination_account_id is not null
   group by t.destination_account_id,
            coalesce(nullif(t.destination_currency, ''), d.currency)
)
select
  k.user_id,
  k.account_id,
  k.currency,
  round(
    coalesce(p.opening_balance, 0)
    + coalesce((select sum(m.delta) from movements m
                 where m.account_id = k.account_id and m.currency = k.currency), 0)
  , 2)::numeric as balance
from keys k
left join public.account_currencies p
       on p.account_id = k.account_id
      and p.currency   = k.currency
      and not p.is_archived;

comment on view public.account_balances is
  'Per-pocket balance computed in the database. Mirrors accountBalancesByCurrency minus the Zenith override. security_invoker: each caller sees only their own rows through the underlying tables RLS.';

-- The view reads base tables as the caller, so the existing row-level policies
-- on accounts / transactions / account_currencies already scope it.
grant select on public.account_balances to authenticated;
