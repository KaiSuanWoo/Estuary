import { convert, type RateMap } from "./fx";
import type { InvestmentAccount, InvestmentSnapshot } from "./types";

/** Snapshot total converted into the user's base currency (raw fallback). */
export function investmentTotalInBase(
  snapshot: InvestmentSnapshot | null | undefined,
  base: string,
  rates: RateMap,
): number {
  if (!snapshot) return 0;
  return (
    convert(snapshot.total, snapshot.base_currency, base, rates) ?? snapshot.total
  );
}

export interface ParsedSnapshot {
  base_currency: string;
  total: number;
  as_of: string | null;
  accounts: InvestmentAccount[];
}

/**
 * Validate/normalise a pasted Zenith export against the snapshot contract:
 * `{ base_currency, total, as_of?, accounts?: [{ name, currency, value }] }`.
 * Throws a user-readable error on malformed input.
 */
export function parseZenithSnapshot(raw: string): ParsedSnapshot {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("That isn't valid JSON.");
  }
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new Error("Expected a JSON object.");
  const o = json as Record<string, unknown>;

  const base_currency =
    typeof o.base_currency === "string" ? o.base_currency.toUpperCase() : "";
  if (!base_currency) throw new Error("Missing base_currency.");

  const total = Number(o.total);
  if (!Number.isFinite(total)) throw new Error("Missing or invalid total.");

  const as_of = typeof o.as_of === "string" ? o.as_of : null;

  const accounts: InvestmentAccount[] = (Array.isArray(o.accounts) ? o.accounts : [])
    .map((a) => {
      const r = (a ?? {}) as Record<string, unknown>;
      return {
        name: typeof r.name === "string" ? r.name : "Account",
        currency:
          typeof r.currency === "string" ? r.currency.toUpperCase() : base_currency,
        value: Number(r.value) || 0,
      };
    });

  return { base_currency, total, as_of, accounts };
}
