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
import type { Budget } from "./types";

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

/*
 * `spendForBudget` used to live here.
 *
 * It walked the whole ledger per budget, and it converted with the live rate
 * alone — ignoring the rate stamped on the entry, which meant a budget and the
 * analytics page could report different figures for the very same expense.
 * `public.budget_spend` replaces it, converting the way everything else does.
 */

export interface BudgetPacing {
  /** Fraction of the period elapsed (0..1), or null for open-ended windows. */
  elapsedRatio: number | null;
  /** Whole days left in the window, counting today. Null if open-ended. */
  daysLeft: number | null;
  /** Total days in the window. Null if open-ended. */
  daysTotal: number | null;
  /** Amount still spendable per remaining day (expense), null when none left. */
  perDayLeft: number | null;
  /** Spend extrapolated to the period end at the current rate. Null if too early. */
  projected: number | null;
  /** True when the spent share is running ahead of the elapsed share. */
  overPace: boolean | null;
}

/**
 * Time-pacing for a recurring budget's current window: how far through the
 * period we are, how many days remain, the safe daily spend, and whether spend
 * is running ahead of an even pace. Open-ended custom windows return nulls.
 */
export function budgetPacing(
  b: Budget,
  spent: number,
  now = new Date(),
): BudgetPacing {
  const w = budgetWindow(b, now);
  if (!w.from || !w.to) {
    return {
      elapsedRatio: null,
      daysLeft: null,
      daysTotal: null,
      perDayLeft: null,
      projected: null,
      overPace: null,
    };
  }
  const from = parseISO(w.from);
  const to = parseISO(w.to);
  const daysTotal = differenceInCalendarDays(to, from) + 1;
  const daysLeft = Math.max(0, differenceInCalendarDays(to, now) + 1);
  const elapsedDays = Math.min(daysTotal, Math.max(0, daysTotal - daysLeft));
  const elapsedRatio = daysTotal > 0 ? elapsedDays / daysTotal : null;

  const remaining = Math.max(0, b.amount - spent);
  const perDayLeft = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null;
  const projected =
    elapsedRatio && elapsedRatio > 0.02 ? spent / elapsedRatio : null;
  const overPace =
    elapsedRatio != null && b.amount > 0
      ? spent / b.amount > elapsedRatio + 0.02
      : null;

  return { elapsedRatio, daysLeft, daysTotal, perDayLeft, projected, overPace };
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
 * Funding progress for a one-time goal budget, from the figures
 * `public.goal_funding` reports.
 *
 * Assigned expenses count as "spent" (net of reimbursement); everything else
 * assigned — money set aside — counts as "saved". Together they fund the
 * target. The sums happen in the database; what is left here is the date
 * arithmetic the due date implies.
 */
export function goalFunding(
  budget: Budget,
  funded: { spent: number; saved: number } | undefined,
  now = new Date(),
): GoalFunding {
  const spent = funded?.spent ?? 0;
  const saved = funded?.saved ?? 0;
  const total = spent + saved;
  const target = budget.amount;
  const remaining = Math.max(0, target - total);
  const ratio = target > 0 ? total / target : 0;

  let daysLeft: number | null = null;
  let perWeek: number | null = null;
  if (budget.due_date) {
    daysLeft = differenceInCalendarDays(parseISO(budget.due_date), now);
    if (daysLeft > 0 && remaining > 0) {
      perWeek = remaining / Math.max(1, Math.ceil(daysLeft / 7));
    }
  }
  return { spent, saved, funded: total, remaining, ratio, daysLeft, perWeek };
}
