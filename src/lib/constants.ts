import type { SeedCategory } from "@/hooks/useCategories";

/**
 * The inks a head may be written in, and the ink for anything without one.
 *
 * Charts colour by rank (see `headInk`) so these are only what a dot or a
 * swatch shows — but they must stay inside the ink-and-earth family, because
 * credit green and debit red are reserved for direction alone.
 */
export const HEAD_SWATCHES: string[] = [
  "#33507a", // iron gall blue
  "#8a5a2b", // sepia
  "#a8802f", // ochre
  "#5b6e8c", // slate
  "#6b4a5e", // plum
  "#7a6a54", // beyond the five
];

/** Written against an entry filed under no head at all. */
export const FALLBACK_HEAD = "#7a6a54";

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
  { value: "investment", label: "Investment" },
  { value: "investmentCash", label: "Investment cash" },
  { value: "credit", label: "Credit card" },
] as const;

/**
 * Default category seed (AU/MY dual-currency lifestyle). Offered both from the
 * Categories empty-state and the onboarding flow.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  // ── Expenses ─────────────────────────────────────────────────────────────
  { name: "Groceries",           kind: "expense", color: "#33507a" },
  { name: "Dining & Takeaway",   kind: "expense", color: "#8a5a2b" },
  { name: "Transport",           kind: "expense", color: "#a8802f" }, // Grab, bus, Uber, petrol
  { name: "Rent & Housing",      kind: "expense", color: "#5b6e8c" },
  { name: "Utilities & Bills",   kind: "expense", color: "#6b4a5e" },
  { name: "Internet & Phone",    kind: "expense", color: "#6b4a5e" },
  { name: "Health & Medical",    kind: "expense", color: "#7a6a54" },
  { name: "Insurance",           kind: "expense", color: "#5b6e8c" },
  { name: "Shopping",            kind: "expense", color: "#8a5a2b" },
  { name: "Subscriptions",       kind: "expense", color: "#5b6e8c" },
  { name: "Entertainment",       kind: "expense", color: "#a8802f" },
  // Travel — split into three since you travel frequently
  { name: "Flights",             kind: "expense", color: "#a8802f" },
  { name: "Accommodation",       kind: "expense", color: "#5b6e8c" },
  { name: "Travel Expenses",     kind: "expense", color: "#8a5a2b" }, // food, activities, forex while away
  // Family
  { name: "Family Support",      kind: "expense", color: "#33507a" }, // gifts / non-reimbursed
  { name: "On Behalf of Family", kind: "expense", color: "#7a6a54" }, // paid for family, will be reimbursed
  // Other
  { name: "Personal Care",       kind: "expense", color: "#33507a" },
  { name: "Fees & Charges",      kind: "expense", color: "#7a6a54" }, // bank fees, Wise FX fees
  // ── Income ───────────────────────────────────────────────────────────────
  { name: "Salary",              kind: "income",  color: "#6b4a5e" },
  { name: "Freelance",           kind: "income",  color: "#6b4a5e" },
  { name: "Family Transfer",     kind: "income",  color: "#33507a" }, // monthly MYR from family
  { name: "Interest",            kind: "income",  color: "#33507a" },
  { name: "Reimbursements",      kind: "income",  color: "#5b6e8c" }, // paid back by family / others
];
