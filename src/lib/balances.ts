import type { Account } from "./types";

/** True when an account effectively holds balances in more than one currency. */
export function isMultiCurrency(balances: Record<string, number>): boolean {
  return Object.keys(balances).length > 1;
}

/**
 * Roll per-account balances — as they come from the `account_balances` view —
 * into one per-currency total across the given accounts.
 *
 * The map is already authoritative: computed in Postgres, with Zenith's
 * valuation layered over the linked accounts. This only has to add up.
 *
 * There used to be a pair of functions here that derived the same totals from
 * the ledger instead — one pass over every transaction per account. They are
 * gone rather than left unused: a second implementation of a balance is a
 * second answer to the same question, and the two drifting apart is precisely
 * the failure that sent the Accounts page and the database different numbers.
 */
export function sumBalances(
  accounts: Account[],
  byAccount: Map<string, Record<string, number>>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const a of accounts) {
    for (const [currency, amount] of Object.entries(byAccount.get(a.id) ?? {}))
      totals[currency] = (totals[currency] ?? 0) + amount;
  }
  return totals;
}
