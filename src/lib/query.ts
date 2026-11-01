import { MutationCache, QueryClient } from "@tanstack/react-query";

/** Centralised query keys so invalidation stays consistent. */
export const qk = {
  session: ["session"] as const,
  profile: ["profile"] as const,
  profilesAll: ["profiles"] as const,
  settings: ["settings"] as const,
  accounts: ["accounts"] as const,
  accountBalances: ["account_balances"] as const,
  // Server-side aggregates (migrations 0027–0032). All of these are derived
  // from the ledger, so the mutation cache below clears them together.
  ledgerMonths: ["ledger_months"] as const,
  monthlyCashflow: ["monthly_cashflow"] as const,
  categorySpendByMonth: ["category_spend_by_month"] as const,
  cashflowByMonth: (from: string, to: string, accountId?: string) =>
    ["cashflow_by_month", from, to, accountId ?? null] as const,
  categorySpend: (from: string, to: string, accountId?: string) =>
    ["category_spend", from, to, accountId ?? null] as const,
  recurringExpenses: (now: string) => ["recurring_expenses", now] as const,
  merchantGroups: ["merchant_groups"] as const,
  budgetSpend: (now: string) => ["budget_spend", now] as const,
  budgetCategorySpend: (now: string) => ["budget_category_spend", now] as const,
  budgetCycles: (months: number, now: string) =>
    ["budget_cycles", months, now] as const,
  goalFunding: ["goal_funding"] as const,
  runningBalance: (accountId: string) =>
    ["account_running_balance", accountId] as const,
  accountCurrencies: ["account_currencies"] as const,
  categories: ["categories"] as const,
  fxRates: ["fx_rates"] as const,
  liveRates: (base: string) => ["live_rates", base] as const,
  counterparties: ["counterparties"] as const,
  tags: ["tags"] as const,
  budgets: ["budgets"] as const,
  budgetLinks: ["budget_category_links"] as const,
  budgetTxnLinks: ["budget_transaction_links"] as const,
  transactionTags: ["transaction_tags"] as const,
  txnTags: (txnId: string) => ["transaction_tags", txnId] as const,
  transactions: (filters?: Record<string, unknown>) =>
    filters ? (["transactions", filters] as const) : (["transactions"] as const),
  // Activity-list variants. All start with "transactions" so the existing
  // create/update/delete invalidations (which target ["transactions"]) clear
  // them by prefix automatically.
  transactionsInfinite: (filters?: Record<string, unknown>) =>
    ["transactions", "infinite", filters ?? {}] as const,
  transactionsPaged: (
    filters: Record<string, unknown>,
    page: number,
    size: number,
  ) => ["transactions", "paged", filters, page, size] as const,
  transactionsSearch: (term: string, filters: Record<string, unknown>) =>
    ["transactions", "search", term, filters] as const,
  importBatches: ["import_batches"] as const,
  categorizationRules: ["categorization_rules"] as const,
  investmentHistory: ["investment_history"] as const,
  investmentSnapshot: ["investment_snapshot"] as const,
  merchantAliases: ["merchant_aliases"] as const,
  reconciliations: ["reconciliations"] as const,
};

/**
 * Everything the database derives from the ledger, listed once.
 *
 * All of it goes stale the instant anything is written — one new transaction
 * can move a balance, a month's cashflow, a category slice, a budget and a
 * subscription estimate at the same time. Clearing them as a set is what keeps
 * them agreeing with each other, which was the point of computing them in one
 * place to begin with.
 *
 * Enumerating the *writers* instead would be two dozen call sites, and one of
 * them would eventually be missed — which looks exactly like the bug all this
 * replaced: a figure that quietly disagrees with the ledger. So refetch after
 * *any* successful mutation. These are small, grouped queries; being
 * occasionally redundant is far cheaper than being occasionally wrong.
 */
const DERIVED_KEYS = [
  qk.accountBalances,
  qk.ledgerMonths,
  qk.monthlyCashflow,
  qk.categorySpendByMonth,
  ["cashflow_by_month"],
  ["category_spend"],
  ["recurring_expenses"],
  qk.merchantGroups,
  ["budget_spend"],
  ["budget_category_spend"],
  ["budget_cycles"],
  qk.goalFunding,
  ["account_running_balance"],
] as const;

const mutationCache = new MutationCache({
  onSuccess: () => {
    for (const key of DERIVED_KEYS)
      void queryClient.invalidateQueries({ queryKey: key });
  },
});

/** Single shared client. Tuned for a personal app on a phone: data is cheap to
 *  refetch, but we don't want a refetch storm every time the PWA regains focus. */
export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
