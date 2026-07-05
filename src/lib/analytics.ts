import {
  addMonths,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { Category, Transaction } from "./types";
import { convert, type RateMap } from "./fx";
import { reimbursementLinks } from "./reimbursements";

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
    if (t.type !== "income") continue;
    for (const link of reimbursementLinks(t)) {
      const amt = inBase(link.amount, t.currency, base, rates);
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
      // In net mode a repayment isn't real income — only the part not allocated
      // to expenses counts (usually nothing).
      if (mode === "net") {
        const links = reimbursementLinks(t);
        if (links.length > 0) {
          const allocated = links.reduce((s, l) => s + l.amount, 0);
          const remainder = Math.max(0, t.amount - allocated);
          if (remainder > 0) income += inBase(remainder, t.currency, base, rates);
          continue;
        }
      }
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
): CategorySlice[] {
  if (kind === "expense")
    return spendingByCategory(txns, categories, base, rates, from, to, mode);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const slices = new Map<string, CategorySlice>();
  for (const t of txns) {
    if (t.type !== "income" || t.date < from || t.date > to) continue;
    if (t.excluded_from_cashflow) continue;
    let amount = inBase(t.amount, t.currency, base, rates);
    if (mode === "net") {
      const links = reimbursementLinks(t);
      if (links.length > 0) {
        const allocated = links.reduce((s, l) => s + l.amount, 0);
        const remainder = Math.max(0, t.amount - allocated);
        if (remainder <= 0) continue;
        amount = inBase(remainder, t.currency, base, rates);
      }
    }
    if (amount === 0) continue;
    const cat = t.category_id ? byId.get(t.category_id) : undefined;
    const key = cat?.id ?? "uncategorised";
    const slice = slices.get(key);
    if (slice) slice.value += amount;
    else
      slices.set(key, {
        id: key,
        name: cat?.name ?? "Uncategorised",
        value: amount,
        color: cat?.color ?? "#4d6175",
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

export interface StackedMonth {
  label: string;
  monthKey: string;
  income: number;
  net: number;
  [category: string]: number | string;
}

/**
 * Per-month stacked expense-by-category plus income & net — the data behind the
 * main combined Analytics chart. Categories beyond `topN` fold into "Other".
 */
export function stackedCategoryByMonth(
  txns: Transaction[],
  categories: Category[],
  base: string,
  rates: RateMap,
  months: string[],
  mode: CashflowMode = "net",
  topN = 6,
): { data: StackedMonth[]; keys: { name: string; color: string }[] } {
  const all = breakdownByCategory(txns, categories, base, rates, "0000-01-01", "9999-12-31", "expense", mode);
  const top = all.slice(0, topN);
  const topNames = new Set(top.map((t) => t.name));
  const keys = top.map((t) => ({ name: t.name, color: t.color }));
  const hasOther = all.length > top.length;
  if (hasOther) keys.push({ name: "Other", color: "#4d6175" });

  const data = months.map<StackedMonth>((mk) => {
    const from = `${mk}-01`;
    const to = format(endOfMonth(parseISO(from)), "yyyy-MM-dd");
    const cats = breakdownByCategory(txns, categories, base, rates, from, to, "expense", mode);
    const cf = cashflowForRange(txns, base, rates, from, to, mode);
    const row: StackedMonth = {
      label: format(parseISO(from), "MMM ''yy"),
      monthKey: mk,
      income: cf.income,
      net: cf.net,
    };
    for (const k of top) row[k.name] = 0;
    let other = 0;
    for (const c of cats) {
      if (topNames.has(c.name)) row[c.name] = (row[c.name] as number) + c.value;
      else other += c.value;
    }
    if (hasOther) row["Other"] = other;
    return row;
  });
  return { data, keys };
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

export interface MerchantStat {
  name: string;
  value: number;
  count: number;
}

/** Top merchants by expense over a range (net-aware), largest first. */
export function merchantLeaderboard(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  from: string,
  to: string,
  mode: CashflowMode = "net",
  topN = 8,
): MerchantStat[] {
  const reimbursed = mode === "net" ? buildReimbursedMap(txns, base, rates) : null;
  const m = new Map<string, MerchantStat>();
  for (const t of txns) {
    if (t.type !== "expense" || t.date < from || t.date > to) continue;
    if (t.excluded_from_cashflow) continue;
    const gross = inBase(t.amount, t.currency, base, rates);
    const reimb = reimbursed?.get(t.id) ?? 0;
    const amount = mode === "net" ? Math.max(0, gross - reimb) : gross;
    if (amount === 0) continue;
    const name = (t.merchant ?? "").trim() || "Unlabelled";
    const s = m.get(name);
    if (s) {
      s.value += amount;
      s.count += 1;
    } else {
      m.set(name, { name, value: amount, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.value - a.value).slice(0, topN);
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
