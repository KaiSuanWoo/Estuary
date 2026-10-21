-- True multi-currency accounts: a Wise holds several balances at once.
--
-- Until now a currency existed on an account only as a side effect of a
-- transaction being denominated in it, and the only opening balance you could
-- state was the account's primary one. So a Wise already holding AUD, MYR and
-- GBP on the day you start tracking could declare one of the three, and the
-- picker would only offer a currency some *other* account already used as its
-- primary.
--
-- A pocket is a declared balance: it exists because there is a row, with or
-- without transactions, and carries its own opening figure.

create table if not exists public.account_currencies (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  account_id      uuid not null references public.accounts (id) on delete cascade,
  currency        text not null,
  opening_balance numeric not null default 0,
  display_order   integer not null default 0,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One pocket per currency per account; adding EUR twice is a mistake.
  unique (account_id, currency)
);

create index if not exists account_currencies_user_idx    on public.account_currencies (user_id);
create index if not exists account_currencies_account_idx on public.account_currencies (account_id);

alter table public.account_currencies enable row level security;

create policy "account_currencies_select_own"
  on public.account_currencies for select using ((select auth.uid()) = user_id);
create policy "account_currencies_insert_own"
  on public.account_currencies for insert with check ((select auth.uid()) = user_id);
create policy "account_currencies_update_own"
  on public.account_currencies for update using ((select auth.uid()) = user_id);
create policy "account_currencies_delete_own"
  on public.account_currencies for delete using ((select auth.uid()) = user_id);

-- Every existing account gets its primary pocket, carrying the opening balance
-- it already had. Nothing moves: a single-currency account now has exactly one
-- pocket holding the same figure it held before.
insert into public.account_currencies (user_id, account_id, currency, opening_balance)
select user_id, id, currency, opening_balance
from public.accounts
on conflict (account_id, currency) do nothing;

-- Which currency a transfer's *incoming* leg is denominated in.
--
-- The balance engine had to assume the destination account's primary currency,
-- which is right for a single-currency account and wrong the moment the
-- destination holds more than one: convert AUD to USD inside Wise and the USD
-- landed in the AUD pocket. Backfilling from the destination account's own
-- currency reproduces today's behaviour exactly, so no existing figure moves.
alter table public.transactions
  add column if not exists destination_currency text;

update public.transactions t
set destination_currency = a.currency
from public.accounts a
where t.destination_account_id = a.id
  and t.destination_currency is null;

-- Every account must have a pocket for its own currency.
--
-- Balances read pockets whenever an account has any, so an account that
-- acquired a second currency without having a row for its first would silently
-- drop its primary opening balance. A trigger is the only place that can
-- guarantee this for every insert path — the app, an import, a manual row.
create or replace function public.ensure_primary_pocket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_currencies (user_id, account_id, currency, opening_balance)
  values (new.user_id, new.id, new.currency, new.opening_balance)
  on conflict (account_id, currency) do nothing;
  return new;
end;
$$;

drop trigger if exists accounts_ensure_primary_pocket on public.accounts;
create trigger accounts_ensure_primary_pocket
  after insert on public.accounts
  for each row execute function public.ensure_primary_pocket();
