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

export const ACCOUNT_TYPE_COLORS: Record<AccountType, AccountTypeColor> = {
  checking:       { dot: "bg-sky-400",     text: "text-sky-400",     bg: "bg-sky-500/15",     border: "border-sky-500/30" },
  savings:        { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
  cash:           { dot: "bg-amber-400",   text: "text-amber-400",   bg: "bg-amber-500/15",   border: "border-amber-500/30" },
  investment:     { dot: "bg-violet-400",  text: "text-violet-400",  bg: "bg-violet-500/15",  border: "border-violet-500/30" },
  investmentCash: { dot: "bg-fuchsia-400", text: "text-fuchsia-400", bg: "bg-fuchsia-500/15", border: "border-fuchsia-500/30" },
  credit:         { dot: "bg-rose-400",    text: "text-rose-400",    bg: "bg-rose-500/15",    border: "border-rose-500/30" },
};
