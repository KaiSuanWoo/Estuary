import type { BalanceOverride } from "./investments";
import type { Account, AccountCurrency, Transaction } from "./types";

/**
 * Per-currency balances for one account, keyed by currency code.
 *
 * Buckets are seeded from the account's declared pockets, each carrying its own
 * opening figure — that is what lets a currency show at 0.00 before anything
 * has happened in it, and what lets a Wise state three opening balances rather
 * than one. With no pockets passed the account's own `currency` and
 * `opening_balance` are used, which is the same thing a single-currency account
 * has always had.
 *
 * Each transaction then contributes under **its own** `currency`. A transfer
 * landing here is credited in the currency it arrived as — `destination_currency`
 * — falling back to this account's primary, which is right whenever the
 * destination holds only one.
 */
export function accountBalancesByCurrency(
  account: Account,
  txns: Transaction[],
  overrides?: Map<string, BalanceOverride>,
  pockets?: AccountCurrency[],
): Record<string, number> {
  const ext = overrides?.get(account.id);
  if (ext) return { [ext.currency]: ext.value };

  const totals: Record<string, number> =
    pockets && pockets.length > 0
      ? Object.fromEntries(
          pockets
            .filter((p) => !p.is_archived)
            .map((p) => [p.currency, Number(p.opening_balance)]),
        )
      : { [account.currency]: account.opening_balance };

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
    // Transfer landing in this account, in whatever currency it arrived as.
    if (tx.type === "transfer" && tx.destination_account_id === account.id) {
      add(tx.destination_currency || account.currency, tx.destination_amount ?? tx.amount);
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
  pockets?: Map<string, AccountCurrency[]>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const account of accounts) {
    const perCur = accountBalancesByCurrency(
      account, txns, overrides, pockets?.get(account.id),
    );
    for (const [cur, val] of Object.entries(perCur)) {
      totals[cur] = (totals[cur] ?? 0) + val;
    }
  }
  return totals;
}
