import type { CategorizationRule } from "./types";
import type { RuleMatchField, RuleMatchOperator } from "./database.types";

/** Minimal shape a rule can be evaluated against (a row or a parsed import row). */
export interface CategorizableTxn {
  merchant: string | null;
  notes: string | null;
  amount: number;
  account_id: string;
}

export interface RuleEffect {
  categoryId: string | null;
  reimbursable: boolean | null;
}

/** Human-readable labels for the rule builder UI. */
export const FIELD_LABELS: Record<RuleMatchField, string> = {
  merchant: "Merchant",
  notes: "Notes",
  amount: "Amount",
  account: "Account",
};

export const OPERATOR_LABELS: Record<RuleMatchOperator, string> = {
  contains: "contains",
  equals: "equals",
  startsWith: "starts with",
  regex: "matches regex",
  amountRange: "in range",
};

/** Operators that make sense for a given field. */
export function operatorsFor(field: RuleMatchField): RuleMatchOperator[] {
  if (field === "amount") return ["amountRange", "equals"];
  if (field === "account") return ["equals"];
  return ["contains", "equals", "startsWith", "regex"];
}

function fieldString(field: RuleMatchField, tx: CategorizableTxn): string {
  switch (field) {
    case "merchant":
      return tx.merchant ?? "";
    case "notes":
      return tx.notes ?? "";
    case "account":
      return tx.account_id;
    case "amount":
      return String(tx.amount);
  }
}

/** Does a single rule match a transaction? */
export function ruleMatches(rule: CategorizationRule, tx: CategorizableTxn): boolean {
  const value = rule.match_value.trim();
  if (!value) return false;

  if (rule.match_operator === "amountRange") {
    // "min-max", "min-" (≥ min), "-max" (≤ max), or a bare "n" (≥ n).
    // Amounts are always positive, so a leading "-" is the max-only form.
    let min = -Infinity;
    let max = Infinity;
    if (value.startsWith("-")) {
      max = Number(value.slice(1)); // "-max" → ≤ max
    } else {
      const dash = value.indexOf("-");
      if (dash === -1) {
        min = Number(value); // bare "n" → ≥ n
      } else {
        min = Number(value.slice(0, dash));
        const hi = value.slice(dash + 1).trim();
        max = hi === "" ? Infinity : Number(hi);
      }
    }
    if (Number.isNaN(min) || Number.isNaN(max)) return false;
    return tx.amount >= min && tx.amount <= max;
  }

  const str = fieldString(rule.match_field, tx);

  switch (rule.match_operator) {
    case "contains":
      return str.toLowerCase().includes(value.toLowerCase());
    case "equals":
      // Account is matched by id (exact); text fields are case-insensitive.
      return rule.match_field === "account"
        ? str === value
        : str.toLowerCase() === value.toLowerCase();
    case "startsWith":
      return str.toLowerCase().startsWith(value.toLowerCase());
    case "regex":
      try {
        return new RegExp(value, "i").test(str);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * First enabled rule (in the given order — callers pass them sorted by priority)
 * that matches the transaction, or null. Effect carries the category + optional
 * reimbursable flag the rule applies.
 */
export function categorize(
  tx: CategorizableTxn,
  rules: CategorizationRule[],
): RuleEffect | null {
  for (const rule of rules) {
    if (!rule.is_enabled) continue;
    if (ruleMatches(rule, tx)) {
      return {
        categoryId: rule.set_category_id,
        reimbursable: rule.set_reimbursable,
      };
    }
  }
  return null;
}
