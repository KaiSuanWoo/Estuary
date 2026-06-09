import type { Account, Transaction } from "./types";

/**
 * Current balance for one account = opening balance, plus income, minus
 * expenses, plus transfers in, minus transfers out. `adjustment` rows are
 * treated as signed corrections via their linked sign (positive income-like).
 *
 * This collapses every currency into a single number — only correct for a
 * single-currency account. For multi-currency accounts use
 * `accountBalancesByCurrency` instead.
 */
export function accountBalance(account: Account, txns: Transaction[]): number {
  let balance = account.opening_balance;

  for (const tx of txns) {
    if (tx.account_id === account.id) {
      if (tx.type === "income" || tx.type === "adjustment") balance += tx.amount;
      else if (tx.type === "expense") balance -= tx.amount;
      else if (tx.type === "transfer") balance -= tx.amount; // money leaving
    }
    // Transfer landing in this account.
    if (tx.type === "transfer" && tx.destination_account_id === account.id) {
      balance += tx.destination_amount ?? tx.amount;
    }
  }

  return balance;
}

/**
 * Per-currency balances for one account, keyed by currency code.
 *
 * The opening balance counts under the account's primary `currency`. Each
 * transaction contributes under **its own** `currency`, so a Wise account that
 * holds both AUD and MYR reports separate balances. A transfer landing in this
 * account is credited under the destination account's currency (i.e. this
 * account's perspective), using `destination_amount`.
 */
export function accountBalancesByCurrency(
  account: Account,
  txns: Transaction[],
): Record<string, number> {
  const totals: Record<string, number> = { [account.currency]: account.opening_balance };
  const add = (cur: string, amt: number) => {
    totals[cur] = (totals[cur] ?? 0) + amt;
  };

  for (const tx of txns) {
    if (tx.account_id === account.id) {
      const cur = tx.currency || account.currency;
      if (tx.type === "income" || tx.type === "adjustment") add(cur, tx.amount);
      else if (tx.type === "expense") add(cur, -tx.amount);
      else if (tx.type === "transfer") add(cur, -tx.amount); // money leaving
    }
    // Transfer landing in this account → credited in this account's currency.
    if (tx.type === "transfer" && tx.destination_account_id === account.id) {
      add(account.currency, tx.destination_amount ?? tx.amount);
    }
  }

  return totals;
}

/** True when an account effectively holds balances in more than one currency. */
export function isMultiCurrency(balances: Record<string, number>): boolean {
  return Object.keys(balances).length > 1;
}

/** Sum balances per currency across a set of accounts. */
export function balancesByCurrency(
  accounts: Account[],
  txns: Transaction[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const account of accounts) {
    const perCur = accountBalancesByCurrency(account, txns);
    for (const [cur, val] of Object.entries(perCur)) {
      totals[cur] = (totals[cur] ?? 0) + val;
    }
  }
  return totals;
}
