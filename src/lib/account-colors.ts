import type { AccountType } from "@/lib/types";

/** Human-readable label for each account type. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking:       "Checking",
  savings:        "Savings",
  cash:           "Cash",
  investment:     "Investment",
  investmentCash: "Investment cash",
  credit:         "Credit card",
};

/**
 * Tailwind class tokens for each account type.
 *
 * dot    — bg-* class for the small coloured indicator dot
 * text   — text-* class for coloured name / label text
 * bg     — semi-transparent tinted background
 * border — coloured border, matches the type hue
 */
export type AccountTypeColor = {
  dot:    string;
  text:   string;
  bg:     string;
  border: string;
};

/**
 * One head-ink per account type. Credit and debit are reserved for direction —
 * a savings account is not "money in" — so none of these may borrow them, and
 * every type gets a distinct ink rather than sharing one.
 */
export const ACCOUNT_TYPE_COLORS: Record<AccountType, AccountTypeColor> = {
  checking:       { dot: "bg-head-1",     text: "text-head-1",     bg: "bg-head-1/15",     border: "border-head-1/30" },
  savings:        { dot: "bg-head-4",     text: "text-head-4",     bg: "bg-head-4/15",     border: "border-head-4/30" },
  cash:           { dot: "bg-head-3",     text: "text-head-3",     bg: "bg-head-3/15",     border: "border-head-3/30" },
  investment:     { dot: "bg-head-5",     text: "text-head-5",     bg: "bg-head-5/15",     border: "border-head-5/30" },
  investmentCash: { dot: "bg-head-other", text: "text-head-other", bg: "bg-head-other/15", border: "border-head-other/30" },
  credit:         { dot: "bg-head-2",     text: "text-head-2",     bg: "bg-head-2/15",     border: "border-head-2/30" },
};
