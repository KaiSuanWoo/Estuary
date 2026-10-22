-- A reconciliation is against one pocket, not one account.
--
-- A statement states a balance in a currency; a Wise holding AUD, MYR and GBP
-- has three such statements and no single figure to check. Without a currency
-- on the row, every check silently meant "the primary", and the other pockets
-- could drift unnoticed.
alter table public.reconciliations
  add column if not exists currency text;

-- Every existing check was, in fact, against the account's primary currency.
update public.reconciliations r
set currency = a.currency
from public.accounts a
where r.account_id = a.id and r.currency is null;

alter table public.reconciliations
  alter column currency set not null;

-- The latest row per account *and currency* is the reconciled state.
create index if not exists reconciliations_account_currency_idx
  on public.reconciliations (account_id, currency, date desc);
