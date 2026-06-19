import { QueryClient } from "@tanstack/react-query";

/** Single shared client. Tuned for a personal app on a phone: data is cheap to
 *  refetch, but we don't want a refetch storm every time the PWA regains focus. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Centralised query keys so invalidation stays consistent. */
export const qk = {
  session: ["session"] as const,
  profile: ["profile"] as const,
  profilesAll: ["profiles"] as const,
  settings: ["settings"] as const,
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  fxRates: ["fx_rates"] as const,
  liveRates: (base: string) => ["live_rates", base] as const,
  counterparties: ["counterparties"] as const,
  tags: ["tags"] as const,
  budgets: ["budgets"] as const,
  budgetLinks: ["budget_category_links"] as const,
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
};
