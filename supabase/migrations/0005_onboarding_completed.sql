-- First-run onboarding gate. New users start `false` and are walked through the
-- guided setup (welcome → base currency → first account → starter categories);
-- existing users predate onboarding so we mark them complete in the same step.
alter table public.settings
  add column if not exists onboarding_completed boolean not null default false;

update public.settings set onboarding_completed = true;
