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

export interface RecurringRow {
  merchant: string;
  cadence: Cadence;
  typical_amount: number;
  monthly_equivalent: number;
  charge_count: number;
  last_date: string;
  next_due: string;
  maybe_stopped: boolean;
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
    queryFn: async (): Promise<RecurringRow[]> => {
      const { data, error } = await supabase.rpc("recurring_expenses", {
        p_now: now,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
