import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { budgetWindow, spendForBudget } from "./budgets";
import { convert, type RateMap } from "./fx";
import type { Budget, Category, Transaction } from "./types";

/**
 * Everything the budgets board needs about one budget, worked out once.
 *
 * The board shows figures rather than sentences, so this returns the figures
 * a reader would otherwise have to infer: the share used, the share of the
 * period gone, and the gap between them. That gap is the whole judgement —
 * "on pace" is just `deviation ≈ 0` said in words, and words are what the
 * board is getting rid of.
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

/** Only monthly-ish budgets have comparable past windows worth charting. */
function cycleStarts(b: Budget, count: number, now: Date): Date[] {
  if (b.period !== "monthly") return [];
  return Array.from({ length: count }, (_, i) => addMonths(now, -(count - 1 - i)));
}

/**
 * Spend inside an explicit date range for a set of categories, using the same
 * net-of-reimbursement rule as `spendForBudget` so every figure on the page
 * agrees with every other.
 */
function spendInRange(
  categoryIds: Set<string>,
  txns: Transaction[],
  base: string,
  rates: RateMap,
  reimbursed: Map<string, number>,
  from: string,
  to: string,
): number {
  if (categoryIds.size === 0) return 0;
  let total = 0;
  for (const t of txns) {
    if (!t.category_id || !categoryIds.has(t.category_id)) continue;
    if (t.date < from || t.date > to) continue;
    if (t.type === "expense") {
      const gross = convert(t.amount, t.currency, base, rates) ?? t.amount;
      total += gross - (reimbursed.get(t.id) ?? 0);
    } else if (t.type === "income") {
      total -= convert(t.amount, t.currency, base, rates) ?? t.amount;
    }
  }
  return Math.max(0, total);
}

export function budgetMetrics(
  budget: Budget,
  categoryIds: Set<string>,
  categories: Category[],
  txns: Transaction[],
  base: string,
  rates: RateMap,
  reimbursed: Map<string, number>,
  opts: { now?: Date; cycles?: number } = {},
): BudgetMetrics {
  const now = opts.now ?? new Date();
  const cycles = opts.cycles ?? 6;
  const w = budgetWindow(budget, now);

  const allocated = budget.amount;
  const spent = spendForBudget(budget, categoryIds, txns, base, rates, reimbursed, now);

  // Entries dated ahead of today are committed but haven't happened, so they
  // must not feed a run-rate — rent booked for the 28th would otherwise imply
  // you spend that much every day.
  const today = format(now, "yyyy-MM-dd");
  const booked = txns.filter((t) => t.date <= today);
  const toDate = spendForBudget(budget, categoryIds, booked, base, rates, reimbursed, now);

  const byIdEarly = new Map(categories.map((c) => [c.id, c]));
  // Fixed heads are committed, not accrued. A budget with nothing variable in
  // it has no pace to be ahead or behind of.
  const paces =
    categoryIds.size === 0 ||
    [...categoryIds].some((id) => !byIdEarly.get(id)?.is_fixed);

  let elapsed: number | null = null;
  let daysLeft: number | null = null;
  if (w.from && w.to) {
    const from = parseISO(w.from);
    const to = parseISO(w.to);
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

  const byId = byIdEarly;
  const breakdown: BudgetCategorySpend[] = [...categoryIds]
    .map((id) => {
      const one = new Set([id]);
      const catSpent = spendForBudget(budget, one, txns, base, rates, reimbursed, now);
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

  const history: BudgetCycle[] = cycleStarts(budget, cycles, now).map((when) => {
    const cw = budgetWindow(budget, when);
    const cSpent =
      cw.from && cw.to
        ? spendInRange(categoryIds, txns, base, rates, reimbursed, cw.from, cw.to)
        : 0;
    return {
      label: format(when, "MMM"),
      spent: cSpent,
      allocated,
      used: allocated > 0 ? cSpent / allocated : 0,
    };
  });

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
