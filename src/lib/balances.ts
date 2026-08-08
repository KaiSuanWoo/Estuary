import type { BalanceOverride } from "./investments";
import type { Account, Transaction } from "./types";

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
  overrides?: Map<string, BalanceOverride>,
): Record<string, number> {
  const ext = overrides?.get(account.id);
  if (ext) return { [ext.currency]: ext.value };

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
  overrides?: Map<string, BalanceOverride>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const account of accounts) {
    const perCur = accountBalancesByCurrency(account, txns, overrides);
    for (const [cur, val] of Object.entries(perCur)) {
      totals[cur] = (totals[cur] ?? 0) + val;
    }
  }
  return totals;
}
