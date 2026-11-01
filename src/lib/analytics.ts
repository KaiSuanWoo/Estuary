import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { Category } from "./types";
import { FALLBACK_HEAD } from "@/lib/constants";

/**
 * The analytics figures, computed over aggregates rather than over the ledger.
 *
 * Everything here used to walk every transaction, and — because a repayment
 * filed in one month can cancel an expense booked in another — had to walk
 * *all* of them even to answer a question about a single month. One render of
 * the Analytics page was roughly eighty-five such passes: twice per month for
 * twelve months of savings rate, twice per month for seven months of anomaly
 * history, once per account for currency exposure, and so on. The cost grew as
 * ledger × history, so it got worse in both directions at once.
 *
 * `monthly_cashflow` and `category_spend_by_month` now arrive pre-grouped —
 * nine rows and a couple of hundred — and what is left in this file is
 * statistics over them: differences, means, standard deviations, a linear
 * extrapolation. That is arithmetic on a handful of numbers, which is exactly
 * what belongs in the browser.
 */

/**
 * "gross" — raw sums with no reimbursement adjustments.
 * "net"   — reimbursement-aware: linked income is excluded from income totals;
 *           reimbursable expenses are shown at their net cost.
 *
 * Both arrive from the database side by side, so the toggle costs no round trip.
 */
export type CashflowMode = "gross" | "net";

export interface Cashflow {
  income: number;
  expense: number;
  net: number;
}

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
 * Amounts below half a cent are rounding dust, not money. A fully reimbursed
 * expense must net to *nothing* — not to a $0.00 sliver that still puts its
 * category on a chart.
 */
const NEGLIGIBLE = 0.005;

/** True when a netted amount is small enough to treat as fully cancelled out. */
export function isNegligible(value: number): boolean {
  return Math.abs(value) < NEGLIGIBLE;
}

/** yyyy-MM strings for every month spanned by an inclusive ISO range. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = startOfMonth(parseISO(from));
  const end = startOfMonth(parseISO(to));
  while (d <= end) {
    out.push(format(d, "yyyy-MM"));
    d = addMonths(d, 1);
  }
  return out;
}

/** Inclusive ISO bounds spanning the last `months` calendar months up to now. */
export function rangeBounds(
  months: number,
  now = new Date(),
): { from: string; to: string } {
  return {
    from: format(startOfMonth(subMonths(now, months - 1)), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

// ─── aggregate row shapes ─────────────────────────────────────────────────────

/** One row of `monthly_cashflow`, or of `cashflow_by_month`. */
export interface MonthRow {
  month: string;
  income_gross: number;
  expense_gross: number;
  income_net: number;
  expense_net: number;
}

/** One row of `category_spend_by_month`. */
export interface CategoryMonthRow {
  month: string;
  category_id: string | null;
  kind: string;
  gross: number;
  net: number;
}

/** One row of `category_spend`. */
export interface CategoryRow {
  category_id: string | null;
  kind: string;
  gross: number;
  net: number;
}

const monthKey = (month: string) => month.slice(0, 7);

/** Totals across a set of month rows. */
export function totalsFor(rows: MonthRow[], mode: CashflowMode): Cashflow {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    income += mode === "gross" ? r.income_gross : r.income_net;
    expense += mode === "gross" ? r.expense_gross : r.expense_net;
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
 * Category rows turned into chart slices, largest first.
 *
 * A slice whose value is negligible drops out rather than sitting on the chart
 * at zero: in net mode that is an expense repaid in full, which cost nothing and
 * so earns no place in the breakdown.
 */
export function slicesFor(
  rows: CategoryRow[],
  categories: Category[],
  kind: "expense" | "income",
  mode: CashflowMode,
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: CategorySlice[] = [];
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const value = mode === "gross" ? r.gross : r.net;
    if (isNegligible(value) || value <= 0) continue;
    const cat = r.category_id ? byId.get(r.category_id) : undefined;
    out.push({
      id: r.category_id ?? "uncategorised",
      name: cat?.name ?? "Uncategorised",
      value,
      color: cat?.color ?? FALLBACK_HEAD,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

export interface MonthlyPoint {
  label: string;
  income: number;
  expense: number;
}

export interface CategoryMover {
  name: string;
  color: string;
  delta: number;
}

/** Biggest category spend changes: current month vs the previous month. */
export function categoryMoversFor(
  rows: CategoryMonthRow[],
  categories: Category[],
  mode: CashflowMode,
  now = new Date(),
  topN = 5,
): CategoryMover[] {
  const cur = format(now, "yyyy-MM");
  const prev = format(subMonths(now, 1), "yyyy-MM");
  const byId = new Map(categories.map((c) => [c.id, c]));

  const pick = (mk: string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.kind !== "expense" || monthKey(r.month) !== mk) continue;
      const v = mode === "gross" ? r.gross : r.net;
      if (isNegligible(v) || v <= 0) continue;
      m.set(r.category_id ?? "uncategorised", v);
    }
    return m;
  };

  const curMap = pick(cur);
  const prevMap = pick(prev);
  const movers: CategoryMover[] = [];
  for (const id of new Set([...curMap.keys(), ...prevMap.keys()])) {
    const delta = (curMap.get(id) ?? 0) - (prevMap.get(id) ?? 0);
    if (isNegligible(delta)) continue;
    const cat = id === "uncategorised" ? undefined : byId.get(id);
    movers.push({
      name: cat?.name ?? "Uncategorised",
      color: cat?.color ?? FALLBACK_HEAD,
      delta,
    });
  }
  return movers
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN);
}

export interface SavingsRatePoint {
  label: string;
  monthKey: string;
  /** net / income for that month, as a percentage (null when no income). */
  rate: number | null;
}

/** Monthly savings rate (net ÷ income) for the given yyyy-MM months. */
export function savingsRateFor(
  rows: MonthRow[],
  months: string[],
  mode: CashflowMode,
): SavingsRatePoint[] {
  const byMonth = new Map(rows.map((r) => [monthKey(r.month), r]));
  return months.map((mk) => {
    const r = byMonth.get(mk);
    const income = r ? (mode === "gross" ? r.income_gross : r.income_net) : 0;
    const expense = r ? (mode === "gross" ? r.expense_gross : r.expense_net) : 0;
    return {
      label: format(parseISO(`${mk}-01`), "MMM ''yy"),
      monthKey: mk,
      rate: income > 0 ? ((income - expense) / income) * 100 : null,
    };
  });
}

export interface MonthProjection {
  /** Spent so far this calendar month. */
  spent: number;
  /** Spend extrapolated to month end at the current daily pace. */
  projected: number;
  /** Average full-month spend over the trailing comparison months. */
  priorAvg: number | null;
  /** projected vs priorAvg, as a fraction (0.13 = 13% above). Null without history. */
  vsPrior: number | null;
  daysElapsed: number;
  daysInMonth: number;
}

/**
 * Month-end spend projection for the CURRENT month: linear extrapolation of the
 * month-to-date pace, compared against the average of up to `lookback` fully
 * elapsed prior months that had any spending.
 */
export function monthEndProjectionFor(
  rows: MonthRow[],
  mode: CashflowMode,
  now = new Date(),
  lookback = 3,
): MonthProjection | null {
  const { from, to } = monthBounds(now);
  const daysInMonth = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const daysElapsed = Math.min(
    daysInMonth,
    differenceInCalendarDays(now, parseISO(from)) + 1,
  );
  // Too early in the month for the pace to mean anything.
  if (daysElapsed < 3) return null;

  const byMonth = new Map(rows.map((r) => [monthKey(r.month), r]));
  const expenseIn = (mk: string) => {
    const r = byMonth.get(mk);
    if (!r) return 0;
    return mode === "gross" ? r.expense_gross : r.expense_net;
  };

  const spent = expenseIn(format(now, "yyyy-MM"));
  if (spent <= 0) return null;
  const projected = (spent / daysElapsed) * daysInMonth;

  const priors: number[] = [];
  for (let i = 1; i <= lookback; i++) {
    const e = expenseIn(format(subMonths(now, i), "yyyy-MM"));
    if (e > 0) priors.push(e);
  }
  const priorAvg = priors.length
    ? priors.reduce((s, x) => s + x, 0) / priors.length
    : null;

  return {
    spent,
    projected,
    priorAvg,
    vsPrior: priorAvg ? projected / priorAvg - 1 : null,
    daysElapsed,
    daysInMonth,
  };
}

export interface CategoryAnomaly {
  name: string;
  color: string;
  /** Standard deviations away from the trailing-months mean (signed). */
  z: number;
  current: number;
  mean: number;
}

/**
 * Categories whose current-month spend sits ≥ `threshold` standard deviations
 * from their own trailing-month norm. Needs ≥3 months of history per category
 * to say anything.
 */
export function categoryAnomaliesFor(
  rows: CategoryMonthRow[],
  categories: Category[],
  mode: CashflowMode,
  now = new Date(),
  lookback = 6,
  threshold = 2,
): CategoryAnomaly[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const value = (r: CategoryMonthRow) => (mode === "gross" ? r.gross : r.net);

  const curKey = format(now, "yyyy-MM");
  const priorKeys = new Set(
    Array.from({ length: lookback }, (_, i) =>
      format(subMonths(now, i + 1), "yyyy-MM"),
    ),
  );

  const current = new Map<string, number>();
  const history = new Map<string, number[]>();
  for (const r of rows) {
    if (r.kind !== "expense") continue;
    const v = value(r);
    if (isNegligible(v) || v <= 0) continue;
    const id = r.category_id ?? "uncategorised";
    const mk = monthKey(r.month);
    if (mk === curKey) current.set(id, v);
    else if (priorKeys.has(mk)) history.set(id, [...(history.get(id) ?? []), v]);
  }

  const out: CategoryAnomaly[] = [];
  for (const [id, cur] of current) {
    const xs = history.get(id);
    if (!xs || xs.length < 3) continue;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(
      xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length,
    );
    if (sd < 1) continue; // flat history — any wobble would look extreme
    const z = (cur - mean) / sd;
    if (Math.abs(z) < threshold) continue;
    const cat = id === "uncategorised" ? undefined : byId.get(id);
    out.push({
      name: cat?.name ?? "Uncategorised",
      color: cat?.color ?? FALLBACK_HEAD,
      z,
      current: cur,
      mean,
    });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export interface MoneyFlow {
  /** `side` fixes which way each node's label points (in→right, out/hub→left). */
  nodes: { name: string; color: string; side: "in" | "hub" | "out" }[];
  links: { source: number; target: number; value: number }[];
}

/**
 * Sankey data for the money-flow chart: income categories → a central Income
 * node → expense categories, with the surplus flowing to "Saved" (or a
 * "From savings" source covering a deficit). Small categories beyond `topN`
 * fold into "Other".
 *
 * Stays in the browser deliberately: it reshapes slices that are already
 * aggregated — at most a dozen of them — into nodes and links. That is drawing,
 * not counting.
 */
export function buildMoneyFlow(
  incomeCats: CategorySlice[],
  expenseCats: CategorySlice[],
  topN = 6,
): MoneyFlow | null {
  const totalIn = incomeCats.reduce((s, c) => s + c.value, 0);
  const totalOut = expenseCats.reduce((s, c) => s + c.value, 0);
  if (totalIn <= 0 && totalOut <= 0) return null;

  const fold = (cats: CategorySlice[]) => {
    const top = cats.slice(0, topN);
    const rest = cats.slice(topN).reduce((s, c) => s + c.value, 0);
    if (rest > 0)
      top.push({ id: "other", name: "Other", value: rest, color: FALLBACK_HEAD });
    return top.filter((c) => c.value > NEGLIGIBLE);
  };

  const nodes: MoneyFlow["nodes"] = [];
  const links: MoneyFlow["links"] = [];
  const add = (name: string, color: string, side: "in" | "hub" | "out") =>
    nodes.push({ name, color, side }) - 1;

  const inSlices = fold(incomeCats);
  const outSlices = fold(expenseCats);
  const hub = add("Income", "#7fd1b9", "hub");

  for (const c of inSlices)
    links.push({ source: add(c.name, c.color, "in"), target: hub, value: c.value });
  // A deficit month still has to balance: the extra spend comes from savings.
  if (totalOut > totalIn && totalOut - totalIn > NEGLIGIBLE)
    links.push({
      source: add("From savings", "#e0a458", "in"),
      target: hub,
      value: totalOut - totalIn,
    });

  for (const c of outSlices)
    links.push({ source: hub, target: add(c.name, c.color, "out"), value: c.value });
  if (totalIn > totalOut && totalIn - totalOut > NEGLIGIBLE)
    links.push({
      source: hub,
      target: add("Saved", "#34d399", "out"),
      value: totalIn - totalOut,
    });

  return links.length ? { nodes, links } : null;
}
