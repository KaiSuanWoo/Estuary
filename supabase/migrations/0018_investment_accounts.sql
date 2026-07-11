-- Zenith live link: investment accounts materialised from the synced snapshot.
--
-- * `investment` account type — full portfolio value (positions + cash), as
--   opposed to `investmentCash` which is cash parked for investing.
-- * `external_source` / `external_key` tie an account to its origin row in the
--   external system ('zenith' + Zenith account name). NULL for normal accounts;
--   Postgres treats NULLs as distinct so the unique index only bites on linked
--   accounts.
-- * `user_id_by_email` lets the zenith-sync edge function (service role) map a
--   Zenith-verified email onto the matching Estuary user without shipping any
--   cross-project secrets.

alter table public.accounts drop constraint accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('checking', 'savings', 'cash', 'investmentCash', 'credit', 'investment'));

alter table public.accounts
  add column external_source text,
  add column external_key    text;

create unique index accounts_external_ref_key
  on public.accounts (user_id, external_source, external_key);

create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users
  where lower(email) = lower(p_email)
    and email_confirmed_at is not null
  limit 1;
$$;

revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
