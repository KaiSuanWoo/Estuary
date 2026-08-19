import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { Category, Transaction } from "./types";
import { convert, type RateMap } from "./fx";
import { reimbursementLinks } from "./reimbursements";
import { FALLBACK_HEAD } from "@/lib/constants";

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

/**
 * Convert an amount belonging to a transaction, preferring the FX rate stamped
 * at entry (`fx_rate`) — the accountant-correct treatment: P&L at historical
 * rates, so past months don't restate as today's rate moves. On transfers
 * `fx_rate` means source→destination (not →base), so it is never used here.
 * Falls back to the live map for unstamped rows.
 */
export function amountInBase(
  amount: number,
  t: Transaction,
  base: string,
  rates: RateMap,
): number {
  if (t.type !== "transfer" && t.fx_rate != null && t.fx_rate > 0 && t.currency !== base)
    return amount * t.fx_rate;
  return inBase(amount, t.currency, base, rates);
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
 * Amounts below half a cent are rounding dust, not money. A fully reimbursed
 * expense must net to *nothing* — not to a $0.00 sliver that still puts its
 * category on a chart — so every net-mode total is tested against this rather
 * than against exact zero.
 */
const NEGLIGIBLE = 0.005;

/** True when a netted amount is small enough to treat as fully cancelled out. */
export function isNegligible(value: number): boolean {
  return Math.abs(value) < NEGLIGIBLE;
}

/**
 * Build a map of expense_id → total amount already reimbursed (in base currency).
 *
 * Always pass the FULL ledger here, never a date- or account-filtered slice:
 * a repayment logged in a different month (or into a different account) still
 * cancels its expense, and looking at a narrow window would silently report
 * that expense at full cost.
 */
/**
 * How much of each expense has been repaid, in base currency.
 *
 * `scope` is the guard rail for cross-account reimbursements. When a summary
 * is narrowed to one account, only repayments that landed *in that account*
 * may net an expense away: paying on one card and being repaid into another
 * leaves the card genuinely down the money, and netting it there would show a
 * balance the account never got back. Unscoped, every repayment counts —
 * across your accounts as a whole, the money did come home.
 */
function buildReimbursedMap(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  scope?: Set<string>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "income") continue;
    if (scope && !scope.has(t.account_id)) continue;
    for (const link of reimbursementLinks(t)) {
      const amt = amountInBase(link.amount, t, base, rates);
      map.set(link.expense_id, (map.get(link.expense_id) ?? 0) + amt);
    }
  }
  return map;
}

/**
 * Income/expense/net across a date range, expressed in the base currency.
 *
 * mode = "net" (default):
 *   - Income with reimbursement links → excluded (cost-share repayment)
 *   - Reimbursable expenses → shown at net cost (gross − total reimbursed)
 *
 * mode = "gross":
 *   - All income/expenses at face value; no reimbursement adjustments
 *
 * Both modes: transactions with `excluded_from_cashflow` are always skipped.
 *
 * `ledger` is the full transaction list used to resolve reimbursements; pass it
 * whenever `txns` has been pre-filtered (by period or account).
 */
export function cashflowForRange(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  from: string,
  to: string,
  mode: CashflowMode = "net",
  ledger: Transaction[] = txns,
  /** Accounts this summary covers; omit for the whole book. See the map. */
  scope?: Set<string>,
): Cashflow {
  const reimbursed =
    mode === "net" ? buildReimbursedMap(ledger, base, rates, scope) : null;

  // The mirror of the guard rail above. A repayment only stops counting as
  // income if the expense it covers is in the same scope — repaid into this
  // account for something bought on another, the money really did arrive here
  // and cancelling it would lose it.
  const inScopeExpenses =
    scope && mode === "net"
      ? new Set(
          ledger
            .filter((t) => t.type === "expense" && scope.has(t.account_id))
            .map((t) => t.id),
        )
      : null;

  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.date < from || t.date > to) continue;
    if (t.excluded_from_cashflow) continue;

    if (t.type === "income") {
      // In net mode a repayment isn't real income — only the part not allocated
      // to expenses counts (usually nothing).
      if (mode === "net") {
        const links = reimbursementLinks(t).filter(
          (l) => !inScopeExpenses || inScopeExpenses.has(l.expense_id),
        );
        if (links.length > 0) {
          const allocated = links.reduce((s, l) => s + l.amount, 0);
          const remainder = Math.max(0, t.amount - allocated);
          if (!isNegligible(remainder))
            income += amountInBase(remainder, t, base, rates);
          continue;
        }
      }
      income += amountInBase(t.amount, t, base, rates);
    } else if (t.type === "expense") {
      const gross = amountInBase(t.amount, t, base, rates);
      if (mode === "net" && reimbursed) {
        const net = gross - (reimbursed.get(t.id) ?? 0);
        if (!isNegligible(net)) expense += Math.max(0, net);
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
 * In "net" mode reimbursable expenses contribute their net cost, and one that
 * has been repaid in full drops out entirely — it cost nothing, so it earns no
 * place in the breakdown. Excluded transactions are always omitted.
 *
 * Pass `ledger` (the full transaction list) whenever `txns` is pre-filtered.
 */
export function spendingByCategory(
  txns: Transaction[],
  categories: Category[],
  base: string,
  rates: RateMap,
  from: string,
  to: string,
  mode: CashflowMode = "net",
  ledger: Transaction[] = txns,
  scope?: Set<string>,
): CategorySlice[] {
  const reimbursed =
    mode === "net" ? buildReimbursedMap(ledger, base, rates, scope) : null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const slices = new Map<string, CategorySlice>();

  for (const t of txns) {
    if (t.type !== "expense" || t.date < from || t.date > to) continue;
    if (t.excluded_from_cashflow) continue;

    const gross = amountInBase(t.amount, t, base, rates);
    const reimb = reimbursed?.get(t.id) ?? 0;
    const amount = mode === "net" ? Math.max(0, gross - reimb) : gross;
    if (isNegligible(amount)) continue;

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
        color: cat?.color ?? FALLBACK_HEAD,
      });
    }
  }

  return [...slices.values()].sort((a, b) => b.value - a.value);
}

/**
 * Category breakdown for either flow direction. Expense reuses the spending
 * logic; income nets out reimbursement repayments in "net" mode.
 */
export function breakdownByCategory(
  txns: Transaction[],
  categories: Category[],
  base: string,
  rates: RateMap,
  from: string,
  to: string,
  kind: "expense" | "income",
  mode: CashflowMode = "net",
  ledger: Transaction[] = txns,
): CategorySlice[] {
  if (kind === "expense")
    return spendingByCategory(txns, categories, base, rates, from, to, mode, ledger);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const slices = new Map<string, CategorySlice>();
  for (const t of txns) {
    if (t.type !== "income" || t.date < from || t.date > to) continue;
    if (t.excluded_from_cashflow) continue;
    let amount = amountInBase(t.amount, t, base, rates);
    if (mode === "net") {
      const links = reimbursementLinks(t);
      if (links.length > 0) {
        // A repayment isn't income — only any unallocated surplus is.
        const allocated = links.reduce((s, l) => s + l.amount, 0);
        const remainder = Math.max(0, t.amount - allocated);
        if (isNegligible(remainder)) continue;
        amount = amountInBase(remainder, t, base, rates);
      }
    }
    if (isNegligible(amount)) continue;
    const cat = t.category_id ? byId.get(t.category_id) : undefined;
    const key = cat?.id ?? "uncategorised";
    const slice = slices.get(key);
    if (slice) slice.value += amount;
    else
      slices.set(key, {
        id: key,
        name: cat?.name ?? "Uncategorised",
        value: amount,
        color: cat?.color ?? FALLBACK_HEAD,
      });
  }
  return [...slices.values()].sort((a, b) => b.value - a.value);
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


export interface MonthlyPoint {
  label: string;
  income: number;
  expense: number;
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

export interface CategoryMover {
  name: string;
  color: string;
  delta: number;
}

/** Biggest category spend changes: current month vs the previous month. */
export function categoryMovers(
  txns: Transaction[],
  categories: Category[],
  base: string,
  rates: RateMap,
  now = new Date(),
  mode: CashflowMode = "net",
  topN = 5,
): CategoryMover[] {
  const cur = monthBounds(now);
  const prev = monthBounds(subMonths(now, 1));
  const curSlices = spendingByCategory(txns, categories, base, rates, cur.from, cur.to, mode);
  const prevSlices = spendingByCategory(txns, categories, base, rates, prev.from, prev.to, mode);
  const curMap = new Map(curSlices.map((s) => [s.id, s.value]));
  const prevMap = new Map(prevSlices.map((s) => [s.id, s.value]));
  const meta = new Map<string, { name: string; color: string }>();
  for (const s of [...prevSlices, ...curSlices]) meta.set(s.id, { name: s.name, color: s.color });

  const movers: CategoryMover[] = [];
  for (const id of new Set([...curMap.keys(), ...prevMap.keys()])) {
    const delta = (curMap.get(id) ?? 0) - (prevMap.get(id) ?? 0);
    if (Math.abs(delta) < 0.005) continue;
    const m = meta.get(id)!;
    movers.push({ name: m.name, color: m.color, delta });
  }
  return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, topN);
}

/** Income vs expense for each of the last `months` months, base currency. */
export function monthlyCashflow(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  months = 6,
  now = new Date(),
  mode: CashflowMode = "net",
  ledger: Transaction[] = txns,
  scope?: Set<string>,
): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = subMonths(now, i);
    const { from, to } = monthBounds(d);
    const cf = cashflowForRange(txns, base, rates, from, to, mode, ledger, scope);
    points.push({ label: format(d, "MMM"), income: cf.income, expense: cf.expense });
  }
  return points;
}

// ─── analyst extensions ───────────────────────────────────────────────────────

export interface SavingsRatePoint {
  label: string;
  monthKey: string;
  /** net / income for that month, as a percentage (null when no income). */
  rate: number | null;
}

/** Monthly savings rate (net ÷ income) for the given yyyy-MM months. */
export function savingsRateSeries(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  months: string[],
  mode: CashflowMode = "net",
): SavingsRatePoint[] {
  return months.map((mk) => {
    const from = `${mk}-01`;
    const to = format(endOfMonth(parseISO(from)), "yyyy-MM-dd");
    const cf = cashflowForRange(txns, base, rates, from, to, mode);
    return {
      label: format(parseISO(from), "MMM ''yy"),
      monthKey: mk,
      rate: cf.income > 0 ? (cf.net / cf.income) * 100 : null,
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
 * Month-end spend projection for the CURRENT month: linear extrapolation of
 * the month-to-date pace, compared against the average of up to `lookback`
 * fully-elapsed prior months that had any spending.
 */
export function monthEndProjection(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  mode: CashflowMode = "net",
  now = new Date(),
  lookback = 3,
): MonthProjection | null {
  const { from, to } = monthBounds(now);
  const daysInMonth = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const daysElapsed = Math.min(daysInMonth, differenceInCalendarDays(now, parseISO(from)) + 1);
  // Too early in the month for the pace to mean anything.
  if (daysElapsed < 3) return null;

  const spent = cashflowForRange(txns, base, rates, from, to, mode).expense;
  if (spent <= 0) return null;
  const projected = (spent / daysElapsed) * daysInMonth;

  const priors: number[] = [];
  for (let i = 1; i <= lookback; i++) {
    const b = monthBounds(subMonths(now, i));
    const e = cashflowForRange(txns, base, rates, b.from, b.to, mode).expense;
    if (e > 0) priors.push(e);
  }
  const priorAvg = priors.length ? priors.reduce((s, x) => s + x, 0) / priors.length : null;

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
export function categoryAnomalies(
  txns: Transaction[],
  categories: Category[],
  base: string,
  rates: RateMap,
  mode: CashflowMode = "net",
  now = new Date(),
  lookback = 6,
  threshold = 2,
): CategoryAnomaly[] {
  const cur = monthBounds(now);
  const current = spendingByCategory(txns, categories, base, rates, cur.from, cur.to, mode);
  const history = new Map<string, number[]>();
  const meta = new Map<string, { name: string; color: string }>();

  for (let i = 1; i <= lookback; i++) {
    const b = monthBounds(subMonths(now, i));
    for (const s of spendingByCategory(txns, categories, base, rates, b.from, b.to, mode)) {
      const xs = history.get(s.id) ?? [];
      xs.push(s.value);
      history.set(s.id, xs);
      meta.set(s.id, { name: s.name, color: s.color });
    }
  }

  const out: CategoryAnomaly[] = [];
  for (const s of current) {
    const xs = history.get(s.id);
    if (!xs || xs.length < 3) continue;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    if (sd < 1) continue; // flat history — any wobble would look extreme
    const z = (s.value - mean) / sd;
    if (Math.abs(z) >= threshold) out.push({ name: s.name, color: s.color, z, current: s.value, mean });
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
    if (rest > 0) top.push({ id: "other", name: "Other", value: rest, color: FALLBACK_HEAD });
    return top.filter((c) => c.value > 0.005);
  };

  const nodes: MoneyFlow["nodes"] = [];
  const links: MoneyFlow["links"] = [];
  const add = (name: string, color: string, side: "in" | "hub" | "out") =>
    nodes.push({ name, color, side }) - 1;

  const inSlices = fold(incomeCats);
  const outSlices = fold(expenseCats);
  const hub = add("Income", "#7fd1b9", "hub");

  for (const c of inSlices) links.push({ source: add(c.name, c.color, "in"), target: hub, value: c.value });
  // A deficit month still has to balance: the extra spend comes from savings.
  if (totalOut > totalIn && totalOut - totalIn > 0.005)
    links.push({ source: add("From savings", "#e0a458", "in"), target: hub, value: totalOut - totalIn });

  for (const c of outSlices) links.push({ source: hub, target: add(c.name, c.color, "out"), value: c.value });
  if (totalIn > totalOut && totalIn - totalOut > 0.005)
    links.push({ source: hub, target: add("Saved", "#34d399", "out"), value: totalIn - totalOut });

  return links.length ? { nodes, links } : null;
}
