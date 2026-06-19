import { convert, type RateMap } from "./fx";
import type { Budget, Transaction } from "./types";

/**
 * The date window a budget rolls spend up over.
 *  - limit: the current month (passed in via `month`)
 *  - goal:  its optional start/end range (open-ended if unset)
 */
export function budgetWindow(
  b: Budget,
  month: { from: string; to: string },
): { from?: string; to?: string } {
  if (b.kind === "goal")
    return { from: b.start_date ?? undefined, to: b.end_date ?? undefined };
  return { from: month.from, to: month.to };
}

/**
 * Sum of expense transactions in a budget's assigned categories within its
 * window, rolled into the base currency. This is the single source of truth for
 * "spent" on both the Budgets page and the dashboard widgets.
 */
export function spendForBudget(
  b: Budget,
  categoryIds: Set<string>,
  txns: Transaction[],
  base: string,
  rates: RateMap,
  month: { from: string; to: string },
): number {
  if (categoryIds.size === 0) return 0;
  const w = budgetWindow(b, month);
  let total = 0;
  for (const t of txns) {
    if (t.type !== "expense") continue;
    if (!t.category_id || !categoryIds.has(t.category_id)) continue;
    if (w.from && t.date < w.from) continue;
    if (w.to && t.date > w.to) continue;
    total += convert(t.amount, t.currency, base, rates) ?? t.amount;
  }
  return total;
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
