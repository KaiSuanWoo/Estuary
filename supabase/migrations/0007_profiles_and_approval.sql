-- Beta access control. Every auth user gets a profile row; new sign-ups start
-- 'pending' and can authenticate but see a holding screen until an admin
-- approves them. Data tables stay user-isolated via their own RLS regardless.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER helper: lets policies check "am I an admin?" without the
-- profiles policy recursively querying profiles. The function owner (postgres)
-- bypasses RLS, so there's no recursion.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Read your own profile; admins can read everyone (to run the approvals queue).
create policy profiles_select on public.profiles
  for select
  using ((select auth.uid()) = id or public.is_admin());

-- Only admins flip status / role.
create policy profiles_update_admin on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- Auto-provision a pending profile whenever an auth user is created (email or
-- OAuth). Runs as definer so it can insert regardless of the caller.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status)
  values (new.id, new.email, 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Harden the SECURITY DEFINER helpers so they aren't exposed as REST RPCs.
-- handle_new_user is trigger-only (triggers fire regardless of EXECUTE grants);
-- is_admin must stay callable by `authenticated` because RLS policies evaluate
-- it, but `anon` never needs it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Backfill any existing users as approved.
insert into public.profiles (id, email, status)
select id, email, 'approved' from auth.users
on conflict (id) do nothing;

-- Promote your first admin manually after signing in once (kept out of version
-- control so no personal email lives in the repo):
--   update public.profiles set is_admin = true, status = 'approved'
--   where email = 'you@example.com';
