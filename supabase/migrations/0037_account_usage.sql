-- What deleting an account would actually destroy.
--
-- `accounts` cascades to `transactions.account_id`, so removing an account
-- takes its whole history with it — and `destination_account_id` is ON DELETE
-- SET NULL, so transfers *into* it lose their landing leg and the money simply
-- stops arriving anywhere. Neither is recoverable, and neither is visible from
-- the account row itself: an archived shell and an archived account holding six
-- years of statements look identical in the list.
--
-- So the confirmation has to be able to name the cost, which means counting
-- both sides. Grouped here rather than in the browser for the usual reason: it
-- is two counts per account, not a ledger fetch, and PostgREST caps an
-- unbounded select at 1000 rows without saying so.

create or replace view public.account_usage
with (security_invoker = on) as
select
  a.user_id,
  a.id as account_id,
  (select count(*) from public.transactions t
    where t.account_id = a.id)             as transaction_count,
  (select count(*) from public.transactions t
    where t.destination_account_id = a.id) as incoming_transfer_count,
  (select min(t.date) from public.transactions t
    where t.account_id = a.id)             as first_entry,
  (select max(t.date) from public.transactions t
    where t.account_id = a.id)             as last_entry
from public.accounts a;

comment on view public.account_usage is
  'Per-account history size, for the archived-accounts delete confirmation: own transactions (ON DELETE CASCADE) and inbound transfers (ON DELETE SET NULL), plus the date span. security_invoker: the base tables RLS scopes it per caller.';

grant select on public.account_usage to authenticated;
