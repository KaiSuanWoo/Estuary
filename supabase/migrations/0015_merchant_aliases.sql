-- Merchant canonicalisation: fold raw bank descriptors ("WOOLWORTHS 1234 NSW")
-- into one canonical name so per-merchant aggregates stop fragmenting.
-- `raw` is the auto-normalised key produced client-side; one hop to canonical.
create table if not exists public.merchant_aliases (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  raw        text        not null,
  canonical  text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, raw)
);

alter table public.merchant_aliases enable row level security;

create policy "merchant_aliases_select_own"
  on public.merchant_aliases for select using ((select auth.uid()) = user_id);
create policy "merchant_aliases_insert_own"
  on public.merchant_aliases for insert with check ((select auth.uid()) = user_id);
create policy "merchant_aliases_update_own"
  on public.merchant_aliases for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "merchant_aliases_delete_own"
  on public.merchant_aliases for delete using ((select auth.uid()) = user_id);
