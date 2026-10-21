-- `investmentCash` becomes `trading`.
--
-- The picker rendered it as "Invest", sitting directly beside "Investment",
-- which read as the same type listed twice. The accounts filed under it were
-- all brokers — CGSI, iTrade, Moomoo — so what the slot actually described was
-- a trading account, not a pot of cash awaiting investment.
--
-- Nothing branches on the value: it drives a label and a dot colour, and the
-- investment roll-up on Home has always keyed off `investment` alone. So this
-- is a rename with a migration attached, not a change of meaning.
--
-- Order matters. Adding the tightened constraint first would fail against the
-- rows still holding the old value, so the rows move first.

alter table public.accounts drop constraint accounts_type_check;

update public.accounts set type = 'trading' where type = 'investmentCash';

alter table public.accounts add constraint accounts_type_check
  check (type in ('checking', 'savings', 'cash', 'trading', 'credit', 'investment'));
