import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/format";
import type { Cadence } from "@/lib/types";

/**
 * Cashflow and category figures, read from the database rather than folded up
 * in the browser.
 *
 * The browser used to answer every one of these by walking the whole ledger —
 * and because a repayment filed in one month can cancel an expense booked in
 * another, it had to walk *all* of it even to answer a question about a single
 * month. `transaction_net` settles the reimbursements server-side, so these are
 * ordinary grouped queries now: a row per month instead of a row per entry.
 *
 * Anything that depends on the reader's own calendar takes today's local date
 * as an argument. `current_date` in Postgres is UTC, which on the first of the
 * month in Australia is still the last of the previous one.
 */

export interface MonthlyCashflowRow {
  month: string;
  income_gross: number;
  expense_gross: number;
  income_net: number;
  expense_net: number;
}

export interface CategorySpendRow {
  category_id: string | null;
  kind: "expense" | "income";
  gross: number;
  net: number;
}

/**
 * One detected subscription. Field names stay as the UI had them — the view
 * reads a subscription, not a result set.
 */
export interface RecurringItem {
  merchant: string;
  cadence: Cadence;
  /** Typical charge (median), in base currency. */
  typicalAmount: number;
  /** typicalAmount expressed per month, for a comparable subscription total. */
  monthlyEquivalent: number;
  count: number;
  lastDate: string;
  /** Estimated next charge date (last + median interval), ISO. */
  nextDue: string;
  /** True when the next charge is already overdue — possibly cancelled. */
  maybeStopped: boolean;
}

/** Months the ledger has any entry in — the only ones worth offering. */
export function useLedgerMonths() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.ledgerMonths,
    enabled: !!user,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("ledger_months")
        .select("month")
        .order("month", { ascending: false });
      if (error) throw error;
      // The view returns a date; the app keys months as yyyy-MM.
      return (data ?? []).map((r) => r.month.slice(0, 7));
    },
  });
}

/** Income and expense for every month, both modes. */
export function useMonthlyCashflow() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.monthlyCashflow,
    enabled: !!user,
    queryFn: async (): Promise<MonthlyCashflowRow[]> => {
      const { data, error } = await supabase
        .from("monthly_cashflow")
        .select("month, income_gross, expense_gross, income_net, expense_net")
        .order("month");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Income and expense per month over a range, optionally narrowed to one
 * account.
 *
 * Narrowing also narrows what may cancel an expense: a repayment that landed in
 * a *different* account never came back to this one, so netting it away here
 * would show money returning that never did. The function applies that rule —
 * it is not a filter the caller can apply afterwards.
 */
export function useCashflowByMonth(from: string, to: string, accountId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.cashflowByMonth(from, to, accountId),
    enabled: !!user && !!from && !!to,
    queryFn: async (): Promise<MonthlyCashflowRow[]> => {
      const { data, error } = await supabase.rpc("cashflow_by_month", {
        p_from: from,
        p_to: to,
        p_account: accountId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Per-category gross and net over a range, optionally one account. */
export function useCategorySpend(from: string, to: string, accountId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.categorySpend(from, to, accountId),
    enabled: !!user && !!from && !!to,
    queryFn: async (): Promise<CategorySpendRow[]> => {
      const { data, error } = await supabase.rpc("category_spend", {
        p_from: from,
        p_to: to,
        p_account: accountId ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Per-category totals for every month at once — what the movers and anomaly
 * checks compare across months.
 */
export function useCategorySpendByMonth() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.categorySpendByMonth,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_spend_by_month")
        .select("month, category_id, kind, gross, net")
        .order("month");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Detected subscriptions and regular bills, dearest first. */
export function useRecurringExpenses() {
  const { user } = useAuth();
  const now = todayISO();
  return useQuery({
    queryKey: qk.recurringExpenses(now),
    enabled: !!user,
    queryFn: async (): Promise<RecurringItem[]> => {
      const { data, error } = await supabase.rpc("recurring_expenses", {
        p_now: now,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        merchant: r.merchant,
        cadence: r.cadence,
        typicalAmount: Number(r.typical_amount),
        monthlyEquivalent: Number(r.monthly_equivalent),
        count: Number(r.charge_count),
        lastDate: r.last_date,
        nextDue: r.next_due,
        maybeStopped: r.maybe_stopped,
      }));
    },
  });
}

/**
 * Spend per day over a range, optionally restricted to a set of categories.
 *
 * `undefined` categories means the whole book; an empty array means a budget
 * with no categories assigned, which has no spend by definition — so the query
 * is skipped rather than sent asking for nothing.
 */
export function useDailySpend(
  from: string,
  to: string,
  categoryIds?: string[],
) {
  const { user } = useAuth();
  const key = categoryIds ? [...categoryIds].sort() : null;

  return useQuery({
    queryKey: ["daily_spend", from, to, key] as const,
    enabled: !!user && !!from && !!to && (key === null || key.length > 0),
    queryFn: async (): Promise<{ day: string; gross: number; net: number }[]> => {
      const { data, error } = await supabase.rpc("daily_spend", {
        p_from: from,
        p_to: to,
        p_categories: key,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The entries behind one category slice, with their base-currency value
 * already worked out. Drilling into a slice genuinely wants rows — but only
 * that slice's rows, over the period on screen.
 */
export function useCategoryEntries(
  categoryId: string | null,
  from: string,
  to: string,
  kind: "expense" | "income",
  enabled = true,
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["transaction_net", "category", categoryId, from, to, kind] as const,
    enabled: !!user && enabled && !!from && !!to,
    queryFn: async () => {
      let q = supabase
        .from("transaction_net")
        .select("id, date, merchant, currency, amount, gross_base, net_base")
        .eq("type", kind)
        .eq("excluded_from_cashflow", false)
        .gte("date", from)
        .lte("date", to);
      q = categoryId === null ? q.is("category_id", null) : q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
