-- Credit cards are liability accounts: purchases are expenses on the card
-- (balance goes negative = amount owed), payments are transfers from another
-- account into the card. Net worth already nets the negative balance out.
alter table public.accounts drop constraint accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('checking', 'savings', 'cash', 'investmentCash', 'credit'));

-- Optional credit limit, for showing available credit.
alter table public.accounts add column if not exists credit_limit numeric;
