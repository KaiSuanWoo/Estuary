import { format, parseISO } from "date-fns";
import type { TransactionType } from "./types";

const fmtCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = fmtCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    });
    fmtCache.set(currency, f);
  }
  return f;
}

/** Format a positive amount as money in its own currency, e.g. "$1,250.00". */
export function formatMoney(amount: number, currency: string): string {
  try {
    return formatter(currency).format(amount);
  } catch {
    // Unknown ISO code → fall back to a plain number with the code suffixed.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Signed money for ledgers: expenses negative, income positive. */
export function formatSignedMoney(
  amount: number,
  currency: string,
  type: TransactionType,
): string {
  const signed = signOf(type) * Math.abs(amount);
  const body = formatMoney(Math.abs(amount), currency);
  if (signed < 0) return `-${body}`;
  if (signed > 0) return `+${body}`;
  return body;
}

/** Ledger sign for a transaction type. Transfers/adjustments are neutral. */
export function signOf(type: TransactionType): -1 | 0 | 1 {
  if (type === "expense") return -1;
  if (type === "income") return 1;
  return 0;
}

export function formatDate(date: string, pattern = "d MMM yyyy"): string {
  return format(parseISO(date), pattern);
}

/** Group key + label helpers for a date, used to section transaction lists. */
export function dayLabel(date: string): string {
  return format(parseISO(date), "EEEE, d MMM");
}

/** Today's date as an ISO yyyy-MM-dd string (local time). */
export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}
