import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Transaction, TransactionType } from "@/lib/types";

/** Rows fetched per page for both the infinite (mobile) and paged (desktop) lists. */
export const PAGE_SIZE = 30;

/**
 * Server-side-expressible filters for the Activity list. Everything here maps to
 * a real `transactions` column so each page is correctly narrowed at the DB —
 * the list no longer needs every row in memory to filter client-side.
 *
 * Array fields should be passed pre-sorted so they hash to stable query keys.
 */
export interface ActivityFilters {
  types?: TransactionType[];
  accountIds?: string[];
  categoryIds?: string[];
  /** Inclusive ISO date bounds (yyyy-MM-dd). */
  from?: string;
  to?: string;
  flaggedOnly?: boolean;
  reimbursableOnly?: boolean;
  /** Free-text match against merchant/notes (ilike). */
  search?: string;
}

export interface TransactionPage {
  rows: Transaction[];
  /** Total rows matching the filters (from the `exact` count), for the pager. */
  count: number;
}

/** Build the filtered, ordered query shared by every Activity fetch. */
function buildQuery(filters: ActivityFilters) {
  let q = supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.types?.length) q = q.in("type", filters.types);
  if (filters.categoryIds?.length) q = q.in("category_id", filters.categoryIds);
  if (filters.from) q = q.gte("date", filters.from);
  if (filters.to) q = q.lte("date", filters.to);
  if (filters.flaggedOnly) q = q.eq("flagged", true);
  if (filters.reimbursableOnly) q = q.eq("is_reimbursable", true);

  // Account match spans both sides of a transfer.
  if (filters.accountIds?.length) {
    const ids = filters.accountIds.join(",");
    q = q.or(`account_id.in.(${ids}),destination_account_id.in.(${ids})`);
  }

  if (filters.search?.trim()) {
    // Strip characters that would break PostgREST's or() grammar.
    const s = filters.search.trim().replace(/[,()%*]/g, " ");
    q = q.or(`merchant.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  return q;
}

/** Fetch a single window of transactions plus the total filtered count. */
export async function fetchTransactionsPage(
  filters: ActivityFilters,
  { offset, limit }: { offset: number; limit: number },
): Promise<TransactionPage> {
  const { data, error, count } = await buildQuery(filters).range(
    offset,
    offset + limit - 1,
  );
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

/**
 * Infinite-scroll list (mobile). Accumulates pages; `getNextPageParam` stops
 * once the loaded count reaches the total.
 */
export function useInfiniteTransactions(
  filters: ActivityFilters,
  enabled = true,
) {
  const { user } = useAuth();

  return useInfiniteQuery({
    queryKey: qk.transactionsInfinite(filters as Record<string, unknown>),
    enabled: !!user && enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage(filters, { offset: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < lastPage.count ? loaded : undefined;
    },
  });
}

/**
 * Page-indexed list (desktop). `keepPreviousData` keeps the current page on
 * screen while the next one loads, so the pager doesn't flash empty.
 */
export function usePagedTransactions(
  filters: ActivityFilters,
  page: number,
  pageSize: number = PAGE_SIZE,
  enabled = true,
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.transactionsPaged(
      filters as Record<string, unknown>,
      page,
      pageSize,
    ),
    enabled: !!user && enabled,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchTransactionsPage(filters, { offset: page * pageSize, limit: pageSize }),
  });
}

/**
 * Broad server-side search for the focused search overlay — returns up to 50
 * matches across all pages (not just the loaded window), so search works even
 * when the main list is paginated.
 */
export function useTransactionSearch(
  term: string,
  baseFilters: ActivityFilters = {},
) {
  const { user } = useAuth();
  const trimmed = term.trim();

  return useQuery({
    queryKey: qk.transactionsSearch(
      trimmed,
      baseFilters as Record<string, unknown>,
    ),
    enabled: !!user && trimmed.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Transaction[]> => {
      const { rows } = await fetchTransactionsPage(
        { ...baseFilters, search: trimmed },
        { offset: 0, limit: 50 },
      );
      return rows;
    },
  });
}
