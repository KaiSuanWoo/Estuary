-- Performance pass flagged by the Supabase database linter.
--
-- 1. RLS init-plan: wrap auth.uid() in a scalar subquery so Postgres evaluates
--    it ONCE per statement (an initplan) instead of re-running it per row.
--    Behaviour is identical; only the query plan improves.
-- 2. Add covering indexes for every foreign key that lacked one.

-- ── RLS init-plan optimization ──────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'accounts', 'categories', 'counterparties', 'tags',
    'import_batches', 'transactions', 'categorization_rules', 'fx_rates'
  ]
  loop
    execute format('drop policy if exists %1$I_owner on public.%1$I;', t);
    execute format($f$
      create policy %1$I_owner on public.%1$I
        for all
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id);
    $f$, t);
  end loop;
end $$;

drop policy if exists transaction_tags_owner on public.transaction_tags;
create policy transaction_tags_owner on public.transaction_tags
  for all
  using (
    exists (
      select 1 from public.transactions tx
      where tx.id = transaction_tags.transaction_id
        and tx.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.transactions tx
      where tx.id = transaction_tags.transaction_id
        and tx.user_id = (select auth.uid())
    )
  );

-- ── Covering indexes for foreign keys ───────────────────────────────────────
create index if not exists accounts_user_id_idx              on public.accounts (user_id);
create index if not exists categories_user_id_idx            on public.categories (user_id);
create index if not exists categories_parent_id_idx          on public.categories (parent_id);
create index if not exists counterparties_user_id_idx        on public.counterparties (user_id);
create index if not exists tags_user_id_idx                  on public.tags (user_id);
create index if not exists import_batches_user_id_idx        on public.import_batches (user_id);
create index if not exists categorization_rules_user_id_idx  on public.categorization_rules (user_id);
create index if not exists categorization_rules_set_cat_idx  on public.categorization_rules (set_category_id);
create index if not exists transactions_counterparty_idx     on public.transactions (counterparty_id);
create index if not exists transactions_destination_acct_idx on public.transactions (destination_account_id);
create index if not exists transactions_import_batch_idx     on public.transactions (import_batch_id);
create index if not exists transactions_linked_txn_idx       on public.transactions (linked_transaction_id);
create index if not exists transaction_tags_tag_id_idx       on public.transaction_tags (tag_id);
