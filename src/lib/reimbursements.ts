import type { Transaction } from "./types";

/** One allocation: how much of an income repayment covers a given expense. */
export interface ReimbursementLink {
  expense_id: string;
  /** Amount allocated, in the income transaction's currency. */
  amount: number;
}

/** Narrow the JSON `reimbursement_links` column into typed allocations. */
export function reimbursementLinks(
  tx: Pick<Transaction, "reimbursement_links">,
): ReimbursementLink[] {
  const raw = tx.reimbursement_links;
  if (!Array.isArray(raw)) return [];
  const out: ReimbursementLink[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      "expense_id" in item &&
      "amount" in item
    ) {
      const expense_id = String((item as Record<string, unknown>).expense_id);
      const amount = Number((item as Record<string, unknown>).amount);
      if (expense_id && Number.isFinite(amount) && amount > 0) {
        out.push({ expense_id, amount });
      }
    }
  }
  return out;
}

/** True when this income transaction is a repayment (reimburses ≥1 expense). */
export function isReimbursement(tx: Transaction): boolean {
  return tx.type === "income" && reimbursementLinks(tx).length > 0;
}

/** A repayment that covers part or all of one expense. */
export interface Repayment {
  /** The income transaction doing the repaying. */
  income: Transaction;
  /** How much of it is allocated to this expense, in the income's currency. */
  amount: number;
}

/**
 * Every repayment that covers `expenseId`, newest first.
 *
 * Reads the links off the income side, which is where they are stored — an
 * expense has no record of what paid it back.
 */
export function repaymentsFor(
  expenseId: string,
  ledger: Transaction[],
): Repayment[] {
  const out: Repayment[] = [];
  for (const t of ledger) {
    if (t.type !== "income") continue;
    for (const link of reimbursementLinks(t)) {
      if (link.expense_id === expenseId) out.push({ income: t, amount: link.amount });
    }
  }
  return out.sort((a, b) => (a.income.date < b.income.date ? 1 : -1));
}

/**
 * True when the money came back to a different account from the one that paid.
 *
 * This matters twice over. The account that paid is genuinely still down the
 * money, so a per-account summary must not net the expense away; and the pair
 * is easy to mis-enter, so it is worth marking wherever it shows.
 */
export function isCrossAccount(expense: Transaction, income: Transaction): boolean {
  return expense.account_id !== income.account_id;
}
