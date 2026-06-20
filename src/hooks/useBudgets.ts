import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Budget, BudgetInsert, BudgetUpdate } from "@/lib/types";

export function useBudgets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.budgets,
    enabled: !!user,
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateBudget() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Omit<BudgetInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("budgets")
        .insert({ ...input, user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.budgets }),
  });
}

export function useUpdateBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: BudgetUpdate }) => {
      const { data, error } = await supabase
        .from("budgets")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.budgets }),
  });
}

export function useDeleteBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.budgets });
      client.invalidateQueries({ queryKey: qk.budgetLinks });
      client.invalidateQueries({ queryKey: qk.budgetTxnLinks });
    },
  });
}

/** All (budget_id, category_id) membership pairs for the user. */
export function useBudgetLinks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.budgetLinks,
    enabled: !!user,
    queryFn: async (): Promise<{ budget_id: string; category_id: string }[]> => {
      const { data, error } = await supabase
        .from("budget_category_links")
        .select("budget_id, category_id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** All (budget_id, transaction_id) membership pairs for the user (goal budgets). */
export function useBudgetTransactionLinks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.budgetTxnLinks,
    enabled: !!user,
    queryFn: async (): Promise<{ budget_id: string; transaction_id: string }[]> => {
      const { data, error } = await supabase
        .from("budget_transaction_links")
        .select("budget_id, transaction_id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Replace a goal's assigned transactions (delete all, insert the chosen ones). */
export function useSetBudgetTransactions() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      budgetId,
      transactionIds,
    }: {
      budgetId: string;
      transactionIds: string[];
    }) => {
      const { error: delErr } = await supabase
        .from("budget_transaction_links")
        .delete()
        .eq("budget_id", budgetId);
      if (delErr) throw delErr;
      if (transactionIds.length > 0) {
        const { error: insErr } = await supabase
          .from("budget_transaction_links")
          .insert(
            transactionIds.map((transaction_id) => ({
              budget_id: budgetId,
              transaction_id,
              user_id: user!.id,
            })),
          );
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.budgetTxnLinks }),
  });
}

/**
 * Set which goals a single transaction belongs to (delete this transaction's
 * links, insert the chosen budgets). Transaction-centric, so it never disturbs
 * other transactions' assignments — the mirror of useSetBudgetTransactions.
 */
export function useSetTransactionGoals() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      transactionId,
      budgetIds,
    }: {
      transactionId: string;
      budgetIds: string[];
    }) => {
      const { error: delErr } = await supabase
        .from("budget_transaction_links")
        .delete()
        .eq("transaction_id", transactionId);
      if (delErr) throw delErr;
      if (budgetIds.length > 0) {
        const { error: insErr } = await supabase
          .from("budget_transaction_links")
          .insert(
            budgetIds.map((budget_id) => ({
              budget_id,
              transaction_id: transactionId,
              user_id: user!.id,
            })),
          );
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.budgetTxnLinks }),
  });
}

/** Replace a budget's assigned categories (delete all, insert the chosen ones). */
export function useSetBudgetCategories() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      budgetId,
      categoryIds,
    }: {
      budgetId: string;
      categoryIds: string[];
    }) => {
      const { error: delErr } = await supabase
        .from("budget_category_links")
        .delete()
        .eq("budget_id", budgetId);
      if (delErr) throw delErr;
      if (categoryIds.length > 0) {
        const { error: insErr } = await supabase
          .from("budget_category_links")
          .insert(
            categoryIds.map((category_id) => ({
              budget_id: budgetId,
              category_id,
              user_id: user!.id,
            })),
          );
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.budgetLinks }),
  });
}
