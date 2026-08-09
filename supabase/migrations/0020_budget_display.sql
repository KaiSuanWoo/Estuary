-- Budgets gain a say in where they appear and in what order.
--
-- `show_on_home` replaces the blunt per-device "budgets on Home" switch that
-- used to live in Settings: the useful control is which budgets are worth a
-- glance from the front page, not whether any of them are. It is per budget and
-- per account, so it follows you between devices — unlike the lamp or the
-- binding, this is a property of the budget rather than of the screen.
--
-- `display_order` lets the board be arranged deliberately. Existing rows fall
-- back to creation order, which is what they were showing already.

alter table public.budgets
  add column if not exists show_on_home boolean not null default false,
  add column if not exists display_order integer;

-- Seed the order from how they were already sorted so nothing jumps on upgrade.
with ranked as (
  select id, row_number() over (partition by user_id order by created_at) - 1 as n
  from public.budgets
)
update public.budgets b
set display_order = ranked.n
from ranked
where b.id = ranked.id and b.display_order is null;

-- Home reads only the pinned ones, so give that lookup an index.
create index if not exists budgets_user_home_idx
  on public.budgets (user_id)
  where show_on_home;
