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
