-- Two fixes to the merchant layer.
--
-- First, `merchant_groups` normalised once per *row*; the planner re-evaluated
-- it for the join, the sort and the grouping, so a thousand transactions cost
-- several thousand calls to a plpgsql function. Merchant strings repeat, so it
-- now normalises once per distinct descriptor — 436 calls instead — and joins
-- the counts back on.
--
-- Second, `detectRecurring` moves here. Not for performance: it was one pass,
-- and it was not hurting. It moves because it was the last caller of the
-- TypeScript merchant normaliser, and keeping that alive meant keeping two
-- copies of a grouping rule that could drift apart and silently split every
-- per-merchant figure. With this in place, `public.normalize_merchant` is the
-- only copy.

create or replace view public.merchant_groups
with (security_invoker = on) as
with names as (
  select distinct user_id, merchant as raw
    from public.transactions
   where merchant is not null and merchant <> ''
),
canon as (
  select
    n.user_id,
    n.raw,
    public.normalize_merchant(n.raw) as norm,
    coalesce(a.canonical, public.normalize_merchant(n.raw)) as canonical
  from names n
  left join public.merchant_aliases a
         on a.user_id = n.user_id
        and lower(a.raw) = lower(public.normalize_merchant(n.raw))
),
counted as (
  select c.user_id, c.raw, c.norm, c.canonical, count(t.id) as entries
    from canon c
    join public.transactions t
      on t.user_id = c.user_id and t.merchant = c.raw
   group by c.user_id, c.raw, c.norm, c.canonical
)
select
  user_id,
  min(canonical)           as canonical,
  array_agg(distinct norm) as keys,
  array_agg(distinct raw)  as raws,
  sum(entries)::bigint     as entries
from counted
group by user_id, lower(canonical);

comment on view public.merchant_groups is
  'One row per canonical merchant, with the normalised keys and raw descriptors that fold into it and a count of entries.';

-- ---------------------------------------------------------------------------
-- Recurring expenses: same canonical merchant, a stable interval, a stable
-- amount ⇒ a subscription or regular bill.
--
-- A function rather than a view so the caller passes its own local date:
-- "this charge is overdue" should be judged against the reader's calendar, not
-- the server's UTC one.
--
-- `percentile_cont(0.5)` is the median the TypeScript computed by hand, and
-- interpolates to the same value for an even count. The MAD check needs the
-- median twice, so the amounts are grouped once and the deviations again.
create or replace function public.recurring_expenses(p_now date default current_date)
returns table (
  merchant           text,
  cadence            text,
  typical_amount     numeric,
  monthly_equivalent numeric,
  charge_count       bigint,
  last_date          date,
  next_due           date,
  maybe_stopped      boolean
)
language sql
stable
set search_path = ''
as $$
  with cadences(cadence, min_days, max_days, per_month) as (
    values ('weekly',      5,   9,   30.44/7),
           ('fortnightly', 12,  17,  30.44/14),
           ('monthly',     26,  35,  1.0),
           ('quarterly',   80,  100, 1.0/3),
           ('yearly',      340, 390, 1.0/12)
  ),
  names as (
    select distinct user_id, merchant as raw
      from public.transactions
     where merchant is not null and merchant <> '' and type = 'expense'
  ),
  canon as (
    select n.user_id, n.raw,
           coalesce(a.canonical, public.normalize_merchant(n.raw)) as merchant
      from names n
      left join public.merchant_aliases a
             on a.user_id = n.user_id
            and lower(a.raw) = lower(public.normalize_merchant(n.raw))
  ),
  charges as (
    select c.merchant, n.user_id, n.date, n.gross_base as amount
      from public.transaction_net n
      join canon c on c.user_id = n.user_id and c.raw = n.merchant
     where n.type = 'expense'
  ),
  gapped as (
    select user_id, merchant, date, amount,
           date - lag(date) over (partition by user_id, merchant order by date) as gap
      from charges
  ),
  stats as (
    -- Same-day duplicates are not a cadence signal, so a zero gap is excluded
    -- from every one of these.
    select user_id, merchant,
           count(*)                                          as charge_count,
           max(date)                                         as last_date,
           count(gap) filter (where gap > 0)                  as gap_count,
           min(gap)   filter (where gap > 0)                  as min_gap,
           max(gap)   filter (where gap > 0)                  as max_gap,
           percentile_cont(0.5) within group (order by gap)
             filter (where gap > 0)                           as med_gap
      from gapped group by user_id, merchant
  ),
  amt as (
    select user_id, merchant,
           percentile_cont(0.5) within group (order by amount) as med_amt
      from charges group by user_id, merchant
  ),
  dev as (
    select c.user_id, c.merchant,
           percentile_cont(0.5) within group (order by abs(c.amount - a.med_amt))
             as mad_amt
      from charges c
      join amt a on a.user_id = c.user_id and a.merchant = c.merchant
     group by c.user_id, c.merchant
  )
  select
    s.merchant,
    cd.cadence,
    round(a.med_amt::numeric, 2),
    round((a.med_amt * cd.per_month)::numeric, 2),
    s.charge_count,
    s.last_date,
    -- Cast to numeric before rounding: round() on a float is half-to-even,
    -- where the TypeScript's Math.round is half-up.
    (s.last_date + round(s.med_gap::numeric)::integer)::date,
    (p_now - (s.last_date + round(s.med_gap::numeric)::integer)) > (cd.max_days * 0.5)
  from stats s
  join amt  a  on a.user_id = s.user_id and a.merchant = s.merchant
  join dev  d  on d.user_id = s.user_id and d.merchant = s.merchant
  join cadences cd
    on s.med_gap >= cd.min_days and s.med_gap <= cd.max_days
  where s.charge_count >= 3
    and s.gap_count    >= 2
    -- Every gap must sit near the median: one skipped month breaks the claim.
    and s.min_gap >= cd.min_days * 0.8
    and s.max_gap <= cd.max_days * 1.4
    and a.med_amt > 0
    -- Amounts stable: median absolute deviation within a quarter of the charge.
    and d.mad_amt / a.med_amt <= 0.25
  order by round((a.med_amt * cd.per_month)::numeric, 2) desc
$$;

comment on function public.recurring_expenses is
  'Detected subscriptions and regular bills: three or more charges to one canonical merchant at a stable interval and a stable amount.';

grant select  on public.merchant_groups             to authenticated;
grant execute on function public.recurring_expenses to authenticated;
