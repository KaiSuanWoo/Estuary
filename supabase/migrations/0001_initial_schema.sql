-- Estuary — initial schema
-- Recovered from the original Supabase project (yysbelpcrygdbdlskphh) before deletion.
-- Apply this to a fresh project when migrating off local-first storage:
--   supabase db push        (with the CLI + a linked project)
-- or paste into the SQL editor.
--
-- Every table is scoped to auth.uid() via RLS. All user-owned rows carry user_id.

-- ---------------------------------------------------------------------------
-- settings: one row per user
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  base_currency  text not null default 'AUD',
  fx_api_enabled boolean not null default true,
  pay_cycle      text not null default 'fortnightly',
  first_pay_date date,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts: where money lives
-- ---------------------------------------------------------------------------
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('checking', 'savings', 'cash', 'investmentCash')),
  savings_type    text check (savings_type in ('fixed', 'disposable', 'investment', 'custom')),
  currency        text not null,
  institution     text,
  opening_balance numeric not null default 0,
  target_amount   numeric,
  color           text,
  icon            text,
  display_order   integer not null default 0,
  is_archived     boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories: hierarchical (parent_id), income or expense
-- ---------------------------------------------------------------------------
create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  kind           text not null check (kind in ('expense', 'income')),
  parent_id      uuid references public.categories (id) on delete set null,
  icon           text,
  color          text,
  monthly_budget numeric,
  display_order  integer not null default 0,
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- counterparties: people / family / merchants for reimbursements & lending
-- ---------------------------------------------------------------------------
create table public.counterparties (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  type       text not null default 'person' check (type in ('person', 'family', 'merchant')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name    text not null,
  color   text
);

-- ---------------------------------------------------------------------------
-- import_batches: CSV / statement import grouping (reversible)
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  source      text,
  file_name   text,
  row_count   integer not null default 0,
  status      text not null default 'committed' check (status in ('committed', 'reverted')),
  imported_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transactions: the core ledger. amount is always positive; `type` gives sign.
-- transfers use destination_account_id / destination_amount / fx_rate.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  type                   text not null check (type in ('expense', 'income', 'transfer', 'adjustment')),
  date                   date not null,
  account_id             uuid not null references public.accounts (id) on delete cascade,
  amount                 numeric not null check (amount > 0),
  currency               text not null,
  category_id            uuid references public.categories (id) on delete set null,
  merchant               text,
  counterparty_id        uuid references public.counterparties (id) on delete set null,
  notes                  text,
  is_reimbursable        boolean not null default false,
  reimbursement_status   text not null default 'none' check (reimbursement_status in ('none', 'pending', 'partial', 'settled')),
  linked_transaction_id  uuid references public.transactions (id) on delete set null,
  excluded_from_cashflow boolean not null default false,
  receipt_image_path     text,
  destination_account_id uuid references public.accounts (id) on delete set null,
  destination_amount     numeric,
  fx_rate                numeric,
  external_id            text,
  import_batch_id        uuid references public.import_batches (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_category_idx on public.transactions (category_id);

-- ---------------------------------------------------------------------------
-- transaction_tags: many-to-many
-- ---------------------------------------------------------------------------
create table public.transaction_tags (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  tag_id         uuid not null references public.tags (id) on delete cascade,
  primary key (transaction_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- categorization_rules: auto-categorize on import / entry
-- ---------------------------------------------------------------------------
create table public.categorization_rules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  priority        integer not null default 100,
  is_enabled      boolean not null default true,
  match_field     text not null check (match_field in ('merchant', 'notes', 'amount', 'account')),
  match_operator  text not null check (match_operator in ('contains', 'equals', 'startsWith', 'regex', 'amountRange')),
  match_value     text not null,
  set_category_id uuid references public.categories (id) on delete set null,
  set_reimbursable boolean,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- fx_rates: cached / manual currency rates
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  base    text not null,
  quote   text not null,
  date    date not null,
  rate    numeric not null,
  source  text not null default 'api' check (source in ('api', 'manual'))
);

create unique index fx_rates_unique_idx on public.fx_rates (user_id, base, quote, date);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user sees only their own rows.
-- ---------------------------------------------------------------------------
alter table public.settings              enable row level security;
alter table public.accounts              enable row level security;
alter table public.categories            enable row level security;
alter table public.counterparties        enable row level security;
alter table public.tags                  enable row level security;
alter table public.import_batches        enable row level security;
alter table public.transactions          enable row level security;
alter table public.transaction_tags      enable row level security;
alter table public.categorization_rules  enable row level security;
alter table public.fx_rates              enable row level security;

-- Simple owner policies for tables with a user_id column.
do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'accounts', 'categories', 'counterparties', 'tags',
    'import_batches', 'transactions', 'categorization_rules', 'fx_rates'
  ]
  loop
    execute format($f$
      create policy %1$I_owner on public.%1$I
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;

-- transaction_tags has no user_id; scope through the parent transaction.
create policy transaction_tags_owner on public.transaction_tags
  for all
  using (
    exists (
      select 1 from public.transactions tx
      where tx.id = transaction_tags.transaction_id and tx.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.transactions tx
      where tx.id = transaction_tags.transaction_id and tx.user_id = auth.uid()
    )
  );
