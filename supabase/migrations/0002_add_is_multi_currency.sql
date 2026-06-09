-- Multi-currency accounts (e.g. Wise) hold balances in more than one currency.
-- Balances are still derived per-currency from transactions.currency; this flag
-- just marks an account as multi-currency so the UI shows a currency picker when
-- adding transactions to it and renders per-currency balances.
alter table public.accounts
  add column if not exists is_multi_currency boolean not null default false;
