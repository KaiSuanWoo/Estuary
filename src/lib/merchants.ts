import type { MerchantAlias } from "./types";

/**
 * Merchant canonicalisation lives in the database.
 *
 * Bank exports fragment one merchant into many raw descriptors ("WOOLWORTHS
 * 1234 NSW AU", "Woolworths 2088"), so every merchant-level figure groups on a
 * canonical name rather than the raw string:
 *
 *   raw → public.normalize_merchant() → alias table → canonical
 *
 * `normalizeMerchant`, `canonicalMerchant` and `groupMerchants` used to be
 * here as well as in SQL. Two copies of a grouping rule drifting apart would
 * split every per-merchant statistic with no error anywhere to show for it, so
 * the TypeScript was removed rather than kept as a second opinion. The port was
 * checked byte-for-byte against all 436 descriptors in the live ledger first.
 *
 * What remains is the alias lookup, which the merchant manager needs in order
 * to tell a renamed group from an untouched one.
 */

/** Case-insensitive alias lookup map from the stored alias rows. */
export function buildAliasMap(aliases: MerchantAlias[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of aliases) m.set(a.raw.toLowerCase(), a.canonical);
  return m;
}
