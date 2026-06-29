import { todayISO } from "./format";
import type { FxRate } from "./types";

export type LiveRateResult = {
  /** The base currency the API was queried with. */
  base: string;
  /** ISO date of the rates (ECB business-day cadence). */
  date: string;
  /** quote → units-of-quote per 1 base */
  rates: Record<string, number>;
};

/**
 * Currency conversion for the dual-currency dashboard.
 *
 * A stored rate row {base, quote, rate} means **1 `base` = `rate` `quote`**.
 * We index every rate forwards and inverted so a single hop can convert in
 * either direction. Multi-hop (e.g. USD→EUR via AUD) is intentionally not
 * attempted — for a personal app you set the handful of pairs you actually use.
 */
export type RateMap = Map<string, number>;

const key = (from: string, to: string) => `${from}->${to}`;

/**
 * Currencies we fetch live rates for.
 * Keep this list in sync with the CURRENCIES constant in Settings.tsx.
 */
export const RATE_CURRENCIES = [
  "AUD", "MYR", "USD", "EUR", "GBP", "SGD",
  "JPY", "CNY", "HKD", "THB", "NZD", "CAD",
];

/**
 * A live-rate provider: a URL to hit and a parser that normalises its response
 * into a {@link LiveRateResult}. Every provider here is free, keyless, and sends
 * `Access-Control-Allow-Origin: *`, so they all work straight from the browser
 * with no backend or token. Parsers return `null` for an empty/invalid payload.
 */
interface RateProvider {
  name: string;
  url: (base: string) => string;
  parse: (json: unknown, base: string) => LiveRateResult | null;
}

/** Restrict a rates map to the currencies we track and drop non-positive values. */
function pickTrackedRates(rates: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of RATE_CURRENCIES) {
    const r = rates[c];
    if (typeof r === "number" && r > 0) out[c] = r;
  }
  return out;
}

/**
 * Providers tried in order. Frankfurter (ECB) is primary; open.er-api.com is an
 * independent fallback so live conversion survives one source being down. Each
 * normalises to "1 `base` = rate `quote`" for the currencies in RATE_CURRENCIES.
 */
const RATE_PROVIDERS: RateProvider[] = [
  {
    name: "frankfurter.dev",
    url: (base) =>
      `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${RATE_CURRENCIES.filter((c) => c !== base).join(",")}`,
    parse: (json, base) => {
      const j = json as { base?: string; date?: string; rates?: Record<string, number> };
      if (!j?.rates || Object.keys(j.rates).length === 0) return null;
      return { base: j.base ?? base, date: j.date ?? todayISO(), rates: j.rates };
    },
  },
  {
    name: "frankfurter.app",
    url: (base) => `https://api.frankfurter.app/latest?from=${base}`,
    parse: (json, base) => {
      const j = json as { base?: string; date?: string; rates?: Record<string, number> };
      if (!j?.rates || Object.keys(j.rates).length === 0) return null;
      return { base: j.base ?? base, date: j.date ?? todayISO(), rates: pickTrackedRates(j.rates) };
    },
  },
  {
    name: "open.er-api.com",
    url: (base) => `https://open.er-api.com/v6/latest/${base}`,
    parse: (json, base) => {
      const j = json as {
        result?: string;
        base_code?: string;
        time_last_update_utc?: string;
        rates?: Record<string, number>;
      };
      if (j?.result !== "success" || !j.rates) return null;
      const rates = pickTrackedRates(j.rates);
      if (Object.keys(rates).length === 0) return null;
      const date = j.time_last_update_utc
        ? new Date(j.time_last_update_utc).toISOString().slice(0, 10)
        : todayISO();
      return { base: j.base_code ?? base, date, rates };
    },
  },
];

/**
 * Fetch live exchange rates, trying each provider in {@link RATE_PROVIDERS} until
 * one returns usable data. All are free, keyless, CORS-enabled public APIs.
 *
 * Returns "1 `base` = rate `quote`" for every currency in RATE_CURRENCIES.
 */
export async function fetchLiveRates(base: string): Promise<LiveRateResult> {
  let lastError: unknown;
  for (const provider of RATE_PROVIDERS) {
    try {
      const res = await fetch(provider.url(base));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = provider.parse(await res.json(), base);
      if (parsed && Object.keys(parsed.rates).length > 0) return parsed;
      throw new Error("Empty rates response");
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("Exchange rate service unavailable");
}

/**
 * Merge a live-rate API result into an existing RateMap.
 * Existing entries are NOT overwritten (stored/manual rates take precedence).
 *
 * In addition to the direct base→quote pairs, cross-rates between every pair of
 * quote currencies are computed (quoteA→quoteB = rateB / rateA).  This means
 * AUD→MYR works correctly even when the live response used EUR as its base
 * (e.g. exchangeratesapi.io free tier).
 */
export function mergeLiveRates(map: RateMap, live: LiveRateResult): RateMap {
  const merged = new Map(map);
  const entries = Object.entries(live.rates).filter(([, r]) => r > 0);

  // Direct pairs: base↔quote
  for (const [quote, rate] of entries) {
    const fwd = key(live.base, quote);
    if (!merged.has(fwd)) merged.set(fwd, rate);
    const inv = key(quote, live.base);
    if (!merged.has(inv)) merged.set(inv, 1 / rate);
  }

  // Cross-rates: quoteA→quoteB = rateB / rateA (both relative to the same base)
  for (const [a, rateA] of entries) {
    for (const [b, rateB] of entries) {
      if (a === b) continue;
      const crossKey = key(a, b);
      if (!merged.has(crossKey)) merged.set(crossKey, rateB / rateA);
    }
  }

  return merged;
}

/** Build a lookup from rate rows. Rows should be newest-first; first wins. */
export function buildRateMap(rates: FxRate[]): RateMap {
  const map: RateMap = new Map();
  for (const r of rates) {
    if (r.rate <= 0) continue;
    const fwd = key(r.base, r.quote);
    if (!map.has(fwd)) map.set(fwd, r.rate);
    const inv = key(r.quote, r.base);
    if (!map.has(inv)) map.set(inv, 1 / r.rate);
  }
  return map;
}

/** Convert an amount between currencies, or null if no rate is known. */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: RateMap,
): number | null {
  if (from === to) return amount;
  const rate = rates.get(key(from, to));
  return rate == null ? null : amount * rate;
}

export interface ConvertedTotal {
  /** Sum of all convertible balances, expressed in the base currency. */
  total: number;
  /** Currencies we held a balance in but couldn't convert (no rate set). */
  missing: string[];
}

/** Roll a per-currency balance map up into a single base-currency total. */
export function totalInBase(
  byCurrency: Record<string, number>,
  baseCurrency: string,
  rates: RateMap,
): ConvertedTotal {
  let total = 0;
  const missing: string[] = [];
  for (const [currency, amount] of Object.entries(byCurrency)) {
    const converted = convert(amount, currency, baseCurrency, rates);
    if (converted == null) missing.push(currency);
    else total += converted;
  }
  return { total, missing };
}
