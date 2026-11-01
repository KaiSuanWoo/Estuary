import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Budget, Category } from "./types";

/**
 * Everything the budgets board needs about one budget, worked out once.
 *
 * The board shows figures rather than sentences, so this returns the figures a
 * reader would otherwise have to infer: the share used, the share of the period
 * gone, and the gap between them. That gap is the whole judgement — "on pace"
 * is just `deviation ≈ 0` said in words, and words are what the board is
 * getting rid of.
 *
 * The *sums* no longer happen here. They arrive from `budget_spend`,
 * `budget_category_spend` and `budget_cycles`, because summing them in the
 * browser meant a pass over the entire ledger for the headline figure, another
 * for each category, and another for each history bar — about forty passes for
 * four budgets, on every render. What remains is arithmetic over a handful of
 * numbers, which is exactly where it belongs.
 */
export interface BudgetMetrics {
  budget: Budget;
  categoryIds: Set<string>;

  /** What was set aside, in base currency. */
  allocated: number;
  /** Spent against it in the current window, net of reimbursements. */
  spent: number;
  /** Allocated − spent. Negative once over. */
  left: number;
  /** spent ÷ allocated. 1 = exactly at the limit. */
  used: number;
  /**
   * Whether this budget's spend accrues through the period at all.
   *
   * A budget made only of fixed heads — rent, insurance — is committed in one
   * charge near the start. Measuring that against a clock produces figures that
   * are arithmetically true and completely meaningless: rent paid on the 3rd
   * reads as 72% ahead of pace and projects to four times its own limit. Those
   * budgets report what was used and nothing else.
   */
  paces: boolean;
  /** Fraction of the window gone, or null for an open-ended one. */
  elapsed: number | null;
  /**
   * used − elapsed. Positive means spending is running ahead of the clock,
   * negative means behind. Expressed in the same units as both, so ±0.12 is
   * "twelve points of the budget ahead of where the month is".
   */
  deviation: number | null;
  /** Spend extrapolated to the end of the window, plus what's already booked. */
  projected: number | null;
  /** Whole days left in the window, counting today. */
  daysLeft: number | null;
  /** What remains, per remaining day. Null once there's nothing left to spend. */
  perDay: number | null;

  /** One row per category in the budget, largest spend first. */
  breakdown: BudgetCategorySpend[];
  /** The last several closed windows, oldest first. */
  history: BudgetCycle[];
}

export interface BudgetCategorySpend {
  id: string;
  name: string;
  color: string;
  spent: number;
  /** This category's share of the budget's own spend. */
  shareOfSpent: number;
  /** This category's spend measured against the whole allocation. */
  shareOfAllocated: number;
}

export interface BudgetCycle {
  /** Short label for the window — "Mar", "2025", the start date. */
  label: string;
  spent: number;
  allocated: number;
  /** spent ÷ allocated for that window. */
  used: number;
}

/** What the server reports for one budget's current window. */
export interface BudgetSpend {
  spent: number;
  /** The part of `spent` already elapsed — entries dated today or earlier. */
  spentToDate: number;
  windowFrom: string | null;
  windowTo: string | null;
}

export function budgetMetrics(
  budget: Budget,
  categoryIds: Set<string>,
  categories: Category[],
  spend: BudgetSpend,
  categorySpend: Map<string, number>,
  cycles: { month: string; spent: number }[],
  opts: { now?: Date } = {},
): BudgetMetrics {
  const now = opts.now ?? new Date();

  const allocated = budget.amount;
  const spent = spend.spent;
  const toDate = spend.spentToDate;

  const byId = new Map(categories.map((c) => [c.id, c]));
  // Fixed heads are committed, not accrued. A budget with nothing variable in
  // it has no pace to be ahead or behind of.
  const paces =
    categoryIds.size === 0 ||
    [...categoryIds].some((id) => !byId.get(id)?.is_fixed);

  let elapsed: number | null = null;
  let daysLeft: number | null = null;
  if (spend.windowFrom && spend.windowTo) {
    const from = parseISO(spend.windowFrom);
    const to = parseISO(spend.windowTo);
    const total = differenceInCalendarDays(to, from) + 1;
    daysLeft = Math.max(0, differenceInCalendarDays(to, now) + 1);
    elapsed = total > 0 ? Math.min(1, Math.max(0, (total - daysLeft) / total)) : null;
  }

  const used = allocated > 0 ? spent / allocated : 0;
  const left = allocated - spent;
  // A run rate needs enough of the period behind it to mean anything; before
  // about a sixth, one early charge swamps the extrapolation.
  const projected =
    paces && elapsed && elapsed > 0.15 ? toDate / elapsed + (spent - toDate) : null;

  const breakdown: BudgetCategorySpend[] = [...categoryIds]
    .map((id) => {
      const catSpent = categorySpend.get(id) ?? 0;
      const cat = byId.get(id);
      return {
        id,
        name: cat?.name ?? "Unfiled",
        color: cat?.color ?? "#7a6a54",
        spent: catSpent,
        shareOfSpent: spent > 0 ? catSpent / spent : 0,
        shareOfAllocated: allocated > 0 ? catSpent / allocated : 0,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const history: BudgetCycle[] = cycles.map((c) => ({
    label: format(parseISO(c.month), "MMM"),
    spent: c.spent,
    allocated,
    used: allocated > 0 ? c.spent / allocated : 0,
  }));

  return {
    budget,
    categoryIds,
    allocated,
    spent,
    left,
    used,
    paces,
    elapsed: paces ? elapsed : null,
    deviation: !paces || elapsed == null ? null : used - elapsed,
    projected,
    daysLeft,
    perDay: paces && daysLeft && daysLeft > 0 && left > 0 ? left / daysLeft : null,
    breakdown,
    history,
  };
}
