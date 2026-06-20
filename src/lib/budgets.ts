import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { convert, type RateMap } from "./fx";
import type { Budget, Transaction } from "./types";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * The date window a budget rolls spend up over, by its `period`:
 *  - weekly/monthly/yearly: the *current* calendar period (auto-resets)
 *  - custom: its start/end range (open-ended if either bound is unset)
 * Weeks start on Monday.
 */
export function budgetWindow(
  b: Budget,
  now = new Date(),
): { from?: string; to?: string } {
  switch (b.period) {
    case "weekly":
      return {
        from: iso(startOfWeek(now, { weekStartsOn: 1 })),
        to: iso(endOfWeek(now, { weekStartsOn: 1 })),
      };
    case "yearly":
      return { from: iso(startOfYear(now)), to: iso(endOfYear(now)) };
    case "custom":
      return { from: b.start_date ?? undefined, to: b.end_date ?? undefined };
    case "monthly":
    default:
      return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
  }
}

/** Human label for a budget's current window, for list rows. */
export function periodLabel(b: Budget, now = new Date()): string {
  switch (b.period) {
    case "weekly":
      return "This week";
    case "yearly":
      return format(now, "yyyy");
    case "custom": {
      const s = (d: string) => format(parseISO(d), "d MMM");
      if (b.start_date && b.end_date) return `${s(b.start_date)} – ${s(b.end_date)}`;
      if (b.start_date) return `From ${s(b.start_date)}`;
      if (b.end_date) return `Until ${s(b.end_date)}`;
      return "All time";
    }
    case "monthly":
    default:
      return format(now, "MMMM");
  }
}

/**
 * Net spend in a budget's assigned categories within its window, in the base
 * currency. The single source of truth for "spent" on both the Budgets page and
 * the dashboard. `direction` only affects display (down vs up), never this.
 *
 * Net = expenses − reimbursed portion − refunds (income in the same categories),
 * floored at 0. `reimbursed` is the base-currency reimbursed-per-transaction map
 * from `useReimbursedAmountMap`.
 */
export function spendForBudget(
  b: Budget,
  categoryIds: Set<string>,
  txns: Transaction[],
  base: string,
  rates: RateMap,
  reimbursed: Map<string, number>,
  now = new Date(),
): number {
  if (categoryIds.size === 0) return 0;
  const w = budgetWindow(b, now);
  let total = 0;
  for (const t of txns) {
    if (!t.category_id || !categoryIds.has(t.category_id)) continue;
    if (w.from && t.date < w.from) continue;
    if (w.to && t.date > w.to) continue;
    if (t.type === "expense") {
      const gross = convert(t.amount, t.currency, base, rates) ?? t.amount;
      total += gross - (reimbursed.get(t.id) ?? 0); // reimbursed is base-currency
    } else if (t.type === "income") {
      total -= convert(t.amount, t.currency, base, rates) ?? t.amount; // refund
    }
  }
  return Math.max(0, total);
}

/** Build budget_id → Set<category_id> from the flat link rows. */
export function groupLinks(
  links: { budget_id: string; category_id: string }[],
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const l of links) {
    let s = m.get(l.budget_id);
    if (!s) {
      s = new Set();
      m.set(l.budget_id, s);
    }
    s.add(l.category_id);
  }
  return m;
}

/** Build budget_id → Set<transaction_id> from the flat goal-link rows. */
export function groupTxnLinks(
  links: { budget_id: string; transaction_id: string }[],
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const l of links) {
    let s = m.get(l.budget_id);
    if (!s) {
      s = new Set();
      m.set(l.budget_id, s);
    }
    s.add(l.transaction_id);
  }
  return m;
}

export interface GoalFunding {
  /** Costs already paid (assigned expenses, net of reimbursement). */
  spent: number;
  /** Money set aside (assigned income/transfer/adjustment). */
  saved: number;
  /** spent + saved. */
  funded: number;
  /** max(0, target − funded). */
  remaining: number;
  /** funded / target (0 when target ≤ 0). */
  ratio: number;
  /** Days until the due date, or null when no due date. Negative = overdue. */
  daysLeft: number | null;
  /** Suggested amount to save per week to hit the target by the due date. */
  perWeek: number | null;
}

/**
 * Funding progress for a one-time goal budget. Assigned expenses count as
 * "spent" (net of reimbursement); everything else assigned (money set aside)
 * counts as "saved". Together they fund the target.
 */
export function goalFunding(
  budget: Budget,
  txnIds: Set<string>,
  txns: Transaction[],
  base: string,
  rates: RateMap,
  reimbursed: Map<string, number>,
  now = new Date(),
): GoalFunding {
  let spent = 0;
  let saved = 0;
  if (txnIds.size > 0) {
    for (const t of txns) {
      if (!txnIds.has(t.id)) continue;
      const amt = convert(t.amount, t.currency, base, rates) ?? t.amount;
      if (t.type === "expense") {
        spent += amt - (reimbursed.get(t.id) ?? 0);
      } else {
        saved += amt;
      }
    }
  }
  spent = Math.max(0, spent);
  const funded = spent + saved;
  const target = budget.amount;
  const remaining = Math.max(0, target - funded);
  const ratio = target > 0 ? funded / target : 0;

  let daysLeft: number | null = null;
  let perWeek: number | null = null;
  if (budget.due_date) {
    daysLeft = differenceInCalendarDays(parseISO(budget.due_date), now);
    if (daysLeft > 0 && remaining > 0) {
      perWeek = remaining / Math.max(1, Math.ceil(daysLeft / 7));
    }
  }
  return { spent, saved, funded, remaining, ratio, daysLeft, perWeek };
}
