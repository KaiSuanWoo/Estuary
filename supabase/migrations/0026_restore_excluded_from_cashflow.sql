-- Restore a column the migrations always claimed existed.
--
-- `0001` declares `transactions.excluded_from_cashflow`, `database.types.ts`
-- types it as a non-nullable boolean, and four places in the analytics layer
-- test it. The live database never had it: whatever this project was first
-- created from predates that line, so every one of those tests has been
-- reading `undefined` and falling through. Nothing was mis-counted — there is
-- no UI that sets the flag, so nothing could have been excluded — but the type
-- was a lie, and the first write to it would have failed at PostgREST.
--
-- `not null default false` is deliberately the behaviour that is already in
-- force: every existing row becomes false, which is what `undefined` already
-- meant to every one of those tests. No figure on any screen moves.
alter table public.transactions
  add column if not exists excluded_from_cashflow boolean not null default false;

comment on column public.transactions.excluded_from_cashflow is
  'Keep this entry out of cashflow and category totals. Balances still count it — the money did move.';
