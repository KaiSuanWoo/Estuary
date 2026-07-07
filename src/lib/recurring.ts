import { differenceInCalendarDays, parseISO } from "date-fns";
import { convert, type RateMap } from "./fx";
import { canonicalMerchant } from "./merchants";
import type { Transaction } from "./types";

/**
 * Recurring-payment detection: same canonical merchant, a stable interval, and
 * a stable amount ⇒ a subscription/regular bill. Powers the subscriptions
 * ledger and the forecastable-fixed-costs number.
 */

export type Cadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

const CADENCES: { cadence: Cadence; min: number; max: number; perMonth: number }[] = [
  { cadence: "weekly", min: 5, max: 9, perMonth: 30.44 / 7 },
  { cadence: "fortnightly", min: 12, max: 17, perMonth: 30.44 / 14 },
  { cadence: "monthly", min: 26, max: 35, perMonth: 1 },
  { cadence: "quarterly", min: 80, max: 100, perMonth: 1 / 3 },
  { cadence: "yearly", min: 340, max: 390, perMonth: 1 / 12 },
];

export interface RecurringItem {
  merchant: string;
  cadence: Cadence;
  /** Typical charge (median), in base currency. */
  typicalAmount: number;
  /** typicalAmount expressed per month, for a comparable subscription total. */
  monthlyEquivalent: number;
  count: number;
  lastDate: string;
  /** Estimated next charge date (last + median interval), ISO. */
  nextDue: string;
  /** True when the next charge is already overdue — possibly cancelled. */
  maybeStopped: boolean;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Detect recurring expenses across the FULL ledger (history is the signal —
 * don't scope this to the analytics period).
 *
 * Rules: ≥3 charges to the same canonical merchant; median interval lands in a
 * known cadence window with no wild outliers; amounts stable (median absolute
 * deviation ≤ 25% of the median charge).
 */
export function detectRecurring(
  txns: Transaction[],
  base: string,
  rates: RateMap,
  aliases: Map<string, string>,
  now = new Date(),
): RecurringItem[] {
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.type !== "expense" || !t.merchant) continue;
    const key = canonicalMerchant(t.merchant, aliases);
    const list = byMerchant.get(key);
    if (list) list.push(t);
    else byMerchant.set(key, [t]);
  }

  const items: RecurringItem[] = [];
  for (const [merchant, list] of byMerchant) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = differenceInCalendarDays(parseISO(sorted[i].date), parseISO(sorted[i - 1].date));
      if (gap > 0) gaps.push(gap); // same-day duplicates aren't a cadence signal
    }
    if (gaps.length < 2) continue;

    const med = median(gaps);
    const window = CADENCES.find((c) => med >= c.min && med <= c.max);
    if (!window) continue;
    // Every gap must be near the median — one skipped month breaks the claim.
    if (!gaps.every((g) => g >= window.min * 0.8 && g <= window.max * 1.4)) continue;

    const amounts = sorted.map((t) => convert(t.amount, t.currency, base, rates) ?? t.amount);
    const medAmt = median(amounts);
    if (medAmt <= 0) continue;
    const mad = median(amounts.map((a) => Math.abs(a - medAmt)));
    if (mad / medAmt > 0.25) continue;

    const last = sorted[sorted.length - 1];
    const nextDue = new Date(parseISO(last.date));
    nextDue.setDate(nextDue.getDate() + Math.round(med));
    items.push({
      merchant,
      cadence: window.cadence,
      typicalAmount: medAmt,
      monthlyEquivalent: medAmt * window.perMonth,
      count: sorted.length,
      lastDate: last.date,
      nextDue: nextDue.toISOString().slice(0, 10),
      maybeStopped: differenceInCalendarDays(now, nextDue) > window.max * 0.5,
    });
  }
  return items.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}
