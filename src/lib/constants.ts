import type { SeedCategory } from "@/hooks/useCategories";

/**
 * Currencies the app offers across Settings, onboarding, and the FX panel.
 * Keep this in sync with RATE_CURRENCIES in `lib/fx.ts` (the set we fetch live
 * rates for).
 */
export const CURRENCIES = [
  "AUD", "MYR", "USD", "EUR", "GBP",
  "SGD", "JPY", "CNY", "HKD", "THB",
  "NZD", "CAD",
] as const;

/** Friendly names for the currency picker in onboarding. */
export const CURRENCY_LABELS: Record<string, string> = {
  AUD: "Australian Dollar",
  MYR: "Malaysian Ringgit",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  SGD: "Singapore Dollar",
  JPY: "Japanese Yen",
  CNY: "Chinese Yuan",
  HKD: "Hong Kong Dollar",
  THB: "Thai Baht",
  NZD: "New Zealand Dollar",
  CAD: "Canadian Dollar",
};

export const PAY_CYCLES = ["weekly", "fortnightly", "monthly"] as const;

/** Account types offered when adding an account (label + the stored value). */
export const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "investmentCash", label: "Investment" },
] as const;

/**
 * Default category seed (AU/MY dual-currency lifestyle). Offered both from the
 * Categories empty-state and the onboarding flow.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  // ── Expenses ─────────────────────────────────────────────────────────────
  { name: "Groceries",           kind: "expense", color: "#4F8A6D" },
  { name: "Dining & Takeaway",   kind: "expense", color: "#E0A458" },
  { name: "Transport",           kind: "expense", color: "#3F72AF" }, // Grab, bus, Uber, petrol
  { name: "Rent & Housing",      kind: "expense", color: "#8AA6C4" },
  { name: "Utilities & Bills",   kind: "expense", color: "#7FD1B9" },
  { name: "Internet & Phone",    kind: "expense", color: "#7FD1B9" },
  { name: "Health & Medical",    kind: "expense", color: "#C46D6D" },
  { name: "Insurance",           kind: "expense", color: "#8AA6C4" },
  { name: "Shopping",            kind: "expense", color: "#E0A458" },
  { name: "Subscriptions",       kind: "expense", color: "#8AA6C4" },
  { name: "Entertainment",       kind: "expense", color: "#3F72AF" },
  // Travel — split into three since you travel frequently
  { name: "Flights",             kind: "expense", color: "#3F72AF" },
  { name: "Accommodation",       kind: "expense", color: "#8AA6C4" },
  { name: "Travel Expenses",     kind: "expense", color: "#E0A458" }, // food, activities, forex while away
  // Family
  { name: "Family Support",      kind: "expense", color: "#4F8A6D" }, // gifts / non-reimbursed
  { name: "On Behalf of Family", kind: "expense", color: "#C46D6D" }, // paid for family, will be reimbursed
  // Other
  { name: "Personal Care",       kind: "expense", color: "#4F8A6D" },
  { name: "Fees & Charges",      kind: "expense", color: "#C46D6D" }, // bank fees, Wise FX fees
  // ── Income ───────────────────────────────────────────────────────────────
  { name: "Salary",              kind: "income",  color: "#7FD1B9" },
  { name: "Freelance",           kind: "income",  color: "#7FD1B9" },
  { name: "Family Transfer",     kind: "income",  color: "#4F8A6D" }, // monthly MYR from family
  { name: "Interest",            kind: "income",  color: "#4F8A6D" },
  { name: "Reimbursements",      kind: "income",  color: "#8AA6C4" }, // paid back by family / others
];
