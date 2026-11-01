import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/format";

/**
 * Budget spend, read from the database.
 *
 * `budgetMetrics` was the most expensive thing in the app: per budget it walked
 * the whole ledger twice for the headline figure, once more for each category
 * in the breakdown, and once for each of six history bars. For four budgets
 * that was roughly forty full passes, on every render of both the board and the
 * dashboard, to produce one number per budget, per category and per month.
 *
 * Today's local date goes with every call. A budget's window is a calendar
 * question, and the server's calendar is UTC — on the first of the month in
 * Australia it would still be reporting the previous month's window.
 */

export interface BudgetSpendRow {
  budget_id: string;
  /** Null on an open-ended custom budget. */
  window_from: string | null;
  window_to: string | null;
  spent: number;
  /** The part of `spent` already elapsed — entries dated today or earlier. */
  spent_to_date: number;
}

/** Spend and window per budget, keyed by budget id. */
export function useBudgetSpend() {
  const { user } = useAuth();
  const now = todayISO();
  return useQuery({
    queryKey: qk.budgetSpend(now),
    enabled: !!user,
    queryFn: async (): Promise<BudgetSpendRow[]> => {
      const { data, error } = await supabase.rpc("budget_spend", { p_now: now });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The same rows as a map, which is how every caller wants them. */
export function useBudgetSpendMap(): Map<string, BudgetSpendRow> {
  const { data = [] } = useBudgetSpend();
  return useMemo(() => new Map(data.map((r) => [r.budget_id, r])), [data]);
}

/** Spend per category within each budget: budget id → category id → spent. */
export function useBudgetCategorySpend(): Map<string, Map<string, number>> {
  const { user } = useAuth();
  const now = todayISO();
  const { data = [] } = useQuery({
    queryKey: qk.budgetCategorySpend(now),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("budget_category_spend", {
        p_now: now,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of data) {
      const inner = m.get(r.budget_id) ?? new Map<string, number>();
      inner.set(r.category_id, Number(r.spent));
      m.set(r.budget_id, inner);
    }
    return m;
  }, [data]);
}

/**
 * The closed monthly windows behind the history bars: budget id → oldest-first
 * list of { month, spent }. Monthly budgets only; nothing else has comparable
 * past windows.
 */
export function useBudgetCycles(
  months = 6,
): Map<string, { month: string; spent: number }[]> {
  const { user } = useAuth();
  const now = todayISO();
  const { data = [] } = useQuery({
    queryKey: qk.budgetCycles(months, now),
    enabled: !!user && months > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("budget_cycles", {
        p_months: months,
        p_now: now,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(() => {
    const m = new Map<string, { month: string; spent: number }[]>();
    for (const r of [...data].sort((a, b) => a.month.localeCompare(b.month))) {
      const list = m.get(r.budget_id) ?? [];
      list.push({ month: r.month, spent: Number(r.spent) });
      m.set(r.budget_id, list);
    }
    return m;
  }, [data]);
}

/** Spent and saved per goal budget, keyed by budget id. */
export function useGoalFunding(): Map<string, { spent: number; saved: number }> {
  const { user } = useAuth();
  const { data = [] } = useQuery({
    queryKey: qk.goalFunding,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("goal_funding");
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(
    () =>
      new Map(
        data.map((r) => [
          r.budget_id,
          { spent: Number(r.spent), saved: Number(r.saved) },
        ]),
      ),
    [data],
  );
}
