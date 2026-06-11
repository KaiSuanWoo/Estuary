-- A reimbursement (income) can now cover MULTIPLE expenses. Each income row
-- carries an array of { expense_id, amount } allocations in its own currency,
-- replacing the single-target `linked_transaction_id` foreign key.
alter table public.transactions
  add column if not exists reimbursement_links jsonb;

-- Backfill the old single-link rows into the new array shape.
update public.transactions
set reimbursement_links = jsonb_build_array(
  jsonb_build_object('expense_id', linked_transaction_id::text, 'amount', amount)
)
where type = 'income'
  and linked_transaction_id is not null
  and reimbursement_links is null;
