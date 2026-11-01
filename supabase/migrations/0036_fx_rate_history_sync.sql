-- Record exchange rates daily, so the rate history actually exists.
--
-- `fx_to_base` converts an entry with no stamped rate using the stored rate as
-- at that entry's own date. That is the right rule, but it can only be as good
-- as the history behind it: before this the table held nine hand-entered rows,
-- so an expense from March converted at a rate first recorded in June, and
-- every unstamped row in the browser converted at *today's* rate — which meant
-- a closed month quietly restated itself every time the market moved. That is
-- what stamping `fx_rate` at entry was introduced to prevent; it just never
-- covered the rows that predate it.
--
-- Done in Postgres rather than in an edge function on purpose. The rate
-- providers are free and keyless, so there is no credential to store, pass or
-- rotate: the schedule, the fetch and the write all happen in one place, with
-- no cross-service authentication at all.
create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

create or replace function public.sync_fx_rates()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Mirrors RATE_CURRENCIES in src/lib/fx.ts.
  tracked  text[] := array['AUD','MYR','USD','EUR','GBP','SGD',
                           'JPY','CNY','HKD','THB','NZD','CAD'];
  b        record;
  resp     extensions.http_response;
  payload  jsonb;
  as_of    date;
  bases    integer := 0;
begin
  for b in
    select distinct s.base_currency
      from public.settings s
     where s.fx_api_enabled
       and s.base_currency = any(tracked)
  loop
    begin
      select *
        into resp
        from extensions.http_get(
          'https://api.frankfurter.dev/v1/latest?base=' || b.base_currency
          || '&symbols=' || array_to_string(
               array(select c from unnest(tracked) c where c <> b.base_currency),
               ',')
        );
    exception when others then
      -- One provider being unreachable must not stop the other bases.
      continue;
    end;

    if resp.status is distinct from 200 then continue; end if;

    begin
      payload := resp.content::jsonb;
    exception when others then
      continue;
    end;

    if payload->'rates' is null or jsonb_typeof(payload->'rates') <> 'object' then
      continue;
    end if;

    -- The rates carry the date the provider published them, which on a weekend
    -- or a holiday is the previous business day. Storing that rather than
    -- today's is what makes the dated lookup honest.
    as_of := coalesce(nullif(payload->>'date', '')::date, current_date);

    insert into public.fx_rates as f (user_id, base, quote, rate, date, source)
    select s.user_id, b.base_currency, r.key, r.value::numeric, as_of, 'api'
      from public.settings s
      cross join lateral jsonb_each_text(payload->'rates') r(key, value)
     where s.fx_api_enabled
       and s.base_currency = b.base_currency
       and r.key = any(tracked)
       and r.value ~ '^[0-9.]+$'
       and r.value::numeric > 0
    on conflict (user_id, base, quote, date) do update
       set rate = excluded.rate
     -- A rate the user typed in themselves is a deliberate figure. The feed
     -- fills gaps; it does not overrule them.
     where f.source <> 'manual';

    bases := bases + 1;
  end loop;

  return bases;
end
$$;

comment on function public.sync_fx_rates is
  'Fetch and store today''s rates for every base currency in use. Writes across users, so it is SECURITY DEFINER and not callable by them. Never overwrites a manually entered rate.';

-- It writes other people's rows, so nobody but the scheduler may call it.
revoke all on function public.sync_fx_rates() from public;
revoke all on function public.sync_fx_rates() from anon, authenticated;

-- Daily, a little after the ECB's afternoon publication has settled.
--
-- Guarded so a replay onto a database that already has the job does not fail.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'sync-fx-rates') then
    perform cron.schedule('sync-fx-rates', '15 6 * * *',
                          'select public.sync_fx_rates()');
  end if;
end
$$;
