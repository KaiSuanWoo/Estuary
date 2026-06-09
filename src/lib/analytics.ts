import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { Category, Transaction } from "./types";
import { convert, type RateMap } from "./fx";

/** Convert to base currency, dropping anything we can't (no rate set). */
function inBase(
  amount: number,
  currency: string,
  base: string,
  rates: RateMap,
): number {
  const v = convert(amount, currency, base, rates);
  return v == null ? 0 : v;
}

export interface Cashflow {
  income: number;
  expense: number;
  net: number;
}

/**
 * "gross" — raw sums with no reimbursement adjustments. Excluded transactions
 *           are still omitted.
 * "net"   — reimbursement-aware: linked income is excluded from income totals;
 *           reimbursable expenses are shown at their net cost.
 */
export type CashflowMode = "gross" | "net";

/** Inclusive ISO date bounds (yyyy-MM-dd) for the month containing `now`. */
export function monthBounds(now = new Date()): { from: string; to: string } {
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function monthLabel(now = new Date()): string {
  return format(now, "MMMM yyyy");
}

/**
 * Build a map of expense_id → total amount already reimbursed (in base currency).
 * Uses the full txns list so cross-month reimbursements are captured.
 */
function buildReimbursedMap(
  txns: Transaction[],
  base: string,
  rates: RateMap,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.type === "income" && t.linked_transaction_id) {
      const amt = inBase(t.amount, t.currency, base, rates);
      map.set(
        t.linked_transaction_id,
        (map.get(t.linked_transaction_id) ?? 0) + amt,
      );
    }
  }
  return map;
}

/**
 * Income/expense/net across a date range, expressed in the base currency.
 *
 * mode = "net" (default):
 *   - Income with `linked_transaction_id` → excluded (cost-share repayment)
 *   - Reimbursable expenses → shown at net cost (gross − total reimbursed)
 *
 * mode = "gross":
 *   - All income/expenses at face value; no reimbursement adjustments
 *
 * Both modes: transactions with `excluded_from_cashflow` are always skipped.
 */
export function cashflowForRange(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  from: string,
  to: string,
  mode: CashflowMode = "net",
): Cashflow {
  const reimbursed =
    mode === "net" ? buildReimbursedMap(txns, base, rates) : null;

  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.date < from || t.date > to) continue;
    if (t.excluded_from_cashflow) continue;

    if (t.type === "income") {
      // In net mode: skip reimbursements (they're not real income)
      if (mode === "net" && t.linked_transaction_id) continue;
      income += inBase(t.amount, t.currency, base, rates);
    } else if (t.type === "expense") {
      const gross = inBase(t.amount, t.currency, base, rates);
      if (mode === "net" && reimbursed) {
        const reimb = reimbursed.get(t.id) ?? 0;
        expense += Math.max(0, gross - reimb);
      } else {
        expense += gross;
      }
    }
  }
  return { income, expense, net: income - expense };
}

export interface CategorySlice {
  id: string;
  name: string;
  value: number;
  color: string;
}

/**
 * Expense totals grouped by category for a date range, largest first.
 * In "net" mode reimbursable expenses contribute their net cost.
 * Excluded transactions are always omitted.
 */
export function spendingByCategory(
  txns: Transaction[],
  categories: Category[],
  base: string,
  rates: RateMap,
  from: string,
  to: string,
  mode: CashflowMode = "net",
): CategorySlice[] {
  const reimbursed =
    mode === "net" ? buildReimbursedMap(txns, base, rates) : null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const slices = new Map<string, CategorySlice>();

  for (const t of txns) {
    if (t.type !== "expense" || t.date < from || t.date > to) continue;
    if (t.excluded_from_cashflow) continue;

    const gross = inBase(t.amount, t.currency, base, rates);
    const reimb = reimbursed?.get(t.id) ?? 0;
    const amount = mode === "net" ? Math.max(0, gross - reimb) : gross;
    if (amount === 0) continue;

    const cat = t.category_id ? byId.get(t.category_id) : undefined;
    const key = cat?.id ?? "uncategorised";
    const slice = slices.get(key);
    if (slice) {
      slice.value += amount;
    } else {
      slices.set(key, {
        id: key,
        name: cat?.name ?? "Uncategorised",
        value: amount,
        color: cat?.color ?? "#4d6175",
      });
    }
  }

  return [...slices.values()].sort((a, b) => b.value - a.value);
}

export interface MonthlyPoint {
  label: string;
  income: number;
  expense: number;
}

/** Income vs expense for each of the last `months` months, base currency. */
export function monthlyCashflow(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  months = 6,
  now = new Date(),
  mode: CashflowMode = "net",
): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = subMonths(now, i);
    const { from, to } = monthBounds(d);
    const cf = cashflowForRange(txns, base, rates, from, to, mode);
    points.push({ label: format(d, "MMM"), income: cf.income, expense: cf.expense });
  }
  return points;
}
