import type { MerchantAlias, Transaction } from "./types";

/**
 * Merchant canonicalisation.
 *
 * Bank exports fragment one merchant into many raw descriptors
 * ("WOOLWORTHS 1234 NSW AU", "Woolworths 2088"). Aggregating on the raw string
 * splits every per-merchant statistic, so all merchant-level analytics group on
 * a canonical name instead:
 *
 *   raw → normalizeMerchant() → alias table (user renames) → canonical
 *
 * `normalizeMerchant` is deliberately conservative — it only strips noise that
 * is unambiguously boilerplate (store numbers, country/state tails, card
 * suffixes, spacing/case) so two genuinely different merchants never collapse.
 */

const STATE_OR_COUNTRY =
  /\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT|AU|AUS|US|USA|UK|GB|SG|MY|NZ)$/i;

/** Auto-normalise a raw merchant string to a stable grouping key. */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return "Unlabelled";
  let s = raw.trim().replace(/\s+/g, " ");

  // Peel boilerplate tails until stable — they stack in any order
  // ("WOOLWORTHS 1012 NSW AU": country, then state, then store number).
  let prev = "";
  while (prev !== s) {
    prev = s;
    // Card/reference tails: "xx1234", "*1234", "#1234", bare trailing digits.
    s = s.replace(/\s+(?:xx|\*|#)?\d{2,}$/i, "");
    // Trailing state/country codes.
    s = s.replace(STATE_OR_COUNTRY, "");
    // Leftover separators.
    s = s.replace(/[\s\-–—·|]+$/g, "").trim();
  }

  if (!s) return raw.trim();

  // SHOUTING bank descriptors → Title Case; mixed-case names pass through
  // untouched (they were typed by a human or a clean exporter).
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s
      .toLowerCase()
      .replace(/(^|[\s\-'/(])([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
  }
  return s;
}

/** Case-insensitive alias lookup map from the stored alias rows. */
export function buildAliasMap(aliases: MerchantAlias[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of aliases) m.set(a.raw.toLowerCase(), a.canonical);
  return m;
}

/** Final display/grouping name for a raw merchant string. */
export function canonicalMerchant(
  raw: string | null | undefined,
  aliases: Map<string, string>,
): string {
  const norm = normalizeMerchant(raw);
  return aliases.get(norm.toLowerCase()) ?? norm;
}

export interface MerchantGroup {
  /** Canonical (post-alias) name — the grouping key. */
  canonical: string;
  /** Auto-normalised keys that fold into this group (alias `raw` values). */
  keys: string[];
  /** Distinct raw descriptor examples, for the manager UI. */
  raws: string[];
  count: number;
}

/** Group every transaction merchant by canonical name, largest group first. */
export function groupMerchants(
  txns: Transaction[],
  aliases: Map<string, string>,
): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>();
  for (const t of txns) {
    if (!t.merchant) continue;
    const norm = normalizeMerchant(t.merchant);
    const canonical = aliases.get(norm.toLowerCase()) ?? norm;
    let g = groups.get(canonical.toLowerCase());
    if (!g) {
      g = { canonical, keys: [], raws: [], count: 0 };
      groups.set(canonical.toLowerCase(), g);
    }
    g.count += 1;
    if (!g.keys.some((k) => k.toLowerCase() === norm.toLowerCase())) g.keys.push(norm);
    if (!g.raws.includes(t.merchant)) g.raws.push(t.merchant);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
