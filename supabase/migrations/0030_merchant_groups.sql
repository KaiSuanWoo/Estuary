-- Merchant canonicalisation, in the database.
--
-- Bank exports fragment one merchant into many descriptors ("WOOLWORTHS 1234
-- NSW AU", "Woolworths 2088"), so every merchant-level figure groups on a
-- canonical name instead of the raw string. The browser was doing that over
-- the whole ledger — 427 distinct merchants across a thousand rows — to produce
-- a count per group.
--
-- A deliberate note on duplication: this is a *port* of `normalizeMerchant`,
-- and two copies of a grouping rule that drift apart would split merchant
-- statistics silently, with no error anywhere. So this becomes the only copy —
-- `transaction_net` exposes the canonical name per row, and the TypeScript
-- version is removed rather than left behind as a second opinion.

-- Auto-normalise a raw descriptor to a stable grouping key.
--
-- Conservative by design: it strips only what is unambiguously boilerplate —
-- store and card numbers, state and country tails, separators, case — so two
-- genuinely different merchants never collapse into one.
create or replace function public.normalize_merchant(p_raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s        text;
  prev     text := '';
  out_     text;
  ch       text;
  prev_ch  text;
  i        integer;
begin
  if p_raw is null or btrim(p_raw) = '' then
    return 'Unlabelled';
  end if;

  s := regexp_replace(btrim(p_raw), '\s+', ' ', 'g');

  -- Peel boilerplate tails until stable: they stack in any order, as in
  -- "WOOLWORTHS 1012 NSW AU" — country, then state, then store number.
  while prev <> s loop
    prev := s;
    -- Card or reference tails: "xx1234", "*1234", "#1234", bare digits.
    s := regexp_replace(s, '\s+(?:xx|\*|#)?\d{2,}$', '', 'i');
    -- Trailing state or country codes.
    s := regexp_replace(
           s,
           '\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT|AU|AUS|US|USA|UK|GB|SG|MY|NZ)$',
           '', 'i');
    -- Leftover separators.
    s := btrim(regexp_replace(s, '[\s–—·|-]+$', '', 'g'));
  end loop;

  if s = '' then
    return btrim(p_raw);
  end if;

  -- SHOUTING bank descriptors become Title Case; a mixed-case name passes
  -- through untouched, since a human or a clean exporter already cased it.
  --
  -- Walked a character at a time rather than handed to `initcap`, which
  -- capitalises after *any* non-alphanumeric: it would turn "A.B.C" into
  -- "A.B.C" where the rule here gives "A.b.c". The separator set is exactly
  -- the one the TypeScript used.
  if s = upper(s) and s ~ '[A-Z]' then
    s := lower(s);
    out_ := '';
    prev_ch := '';
    for i in 1 .. length(s) loop
      ch := substr(s, i, 1);
      if (i = 1 or prev_ch ~ '[\s''/(-]') and ch ~ '[a-z]' then
        out_ := out_ || upper(ch);
      else
        out_ := out_ || ch;
      end if;
      prev_ch := ch;
    end loop;
    s := out_;
  end if;

  return s;
end
$$;

comment on function public.normalize_merchant is
  'Auto-normalise a raw bank descriptor to a stable grouping key. The single source of truth for merchant grouping — the TypeScript copy was removed so the two cannot drift.';

-- Canonical name for a raw descriptor: auto-normalised, then the user's own
-- rename applied if they have one.
create or replace function public.canonical_merchant(p_user uuid, p_raw text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select a.canonical from public.merchant_aliases a
      where a.user_id = p_user
        and lower(a.raw) = lower(public.normalize_merchant(p_raw))
      limit 1),
    public.normalize_merchant(p_raw)
  )
$$;

comment on function public.canonical_merchant is
  'Display and grouping name for a raw merchant string: normalised, then the user''s alias if one exists.';

-- ---------------------------------------------------------------------------
-- Every canonical merchant group, with the descriptors that fold into it.
--
-- `keys` are the auto-normalised names (what an alias row's `raw` holds, so the
-- manager can tell a renamed group from an untouched one); `raws` are the
-- original descriptors, for showing what was folded.
create or replace view public.merchant_groups
with (security_invoker = on) as
with normed as (
  select
    t.user_id,
    t.merchant                                as raw,
    public.normalize_merchant(t.merchant)     as norm
  from public.transactions t
  where t.merchant is not null and t.merchant <> ''
),
resolved as (
  select
    n.user_id,
    n.raw,
    n.norm,
    coalesce(a.canonical, n.norm) as canonical
  from normed n
  left join public.merchant_aliases a
         on a.user_id = n.user_id
        and lower(a.raw) = lower(n.norm)
)
select
  user_id,
  min(canonical)                as canonical,
  array_agg(distinct norm)      as keys,
  array_agg(distinct raw)       as raws,
  count(*)                      as entries
from resolved
group by user_id, lower(canonical);

comment on view public.merchant_groups is
  'One row per canonical merchant, with the normalised keys and raw descriptors that fold into it and a count of entries.';

grant execute on function public.normalize_merchant  to authenticated;
grant execute on function public.canonical_merchant  to authenticated;
grant select   on public.merchant_groups             to authenticated;
