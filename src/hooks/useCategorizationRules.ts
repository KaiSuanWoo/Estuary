import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { categorize } from "@/lib/categorize";
import type {
  CategorizationRule,
  CategorizationRuleInsert,
  CategorizationRuleUpdate,
  ReimbursementStatus,
} from "@/lib/types";

/** All rules, evaluated top-to-bottom (lowest priority number wins). */
export function useCategorizationRules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.categorizationRules,
    enabled: !!user,
    queryFn: async (): Promise<CategorizationRule[]> => {
      const { data, error } = await supabase
        .from("categorization_rules")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateRule() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Omit<CategorizationRuleInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("categorization_rules")
        .insert({ ...input, user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: qk.categorizationRules }),
  });
}

export function useUpdateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: CategorizationRuleUpdate;
    }) => {
      const { data, error } = await supabase
        .from("categorization_rules")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: qk.categorizationRules }),
  });
}

export function useDeleteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categorization_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: qk.categorizationRules }),
  });
}

/**
 * Apply all enabled rules to existing **uncategorised** income/expense
 * transactions. Won't overwrite a transaction that already has a category.
 * Updates are batched per (category, reimbursable) target for efficiency.
 */
export function useApplyRules() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ updated: number; scanned: number }> => {
      const [{ data: rules }, { data: cats }, { data: txns }] =
        await Promise.all([
          supabase
            .from("categorization_rules")
            .select("*")
            .eq("is_enabled", true)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase.from("categories").select("id, kind"),
          supabase
            .from("transactions")
            .select("id, type, merchant, notes, amount, account_id")
            .is("category_id", null)
            .in("type", ["expense", "income"]),
        ]);

      const rulesList = rules ?? [];
      const txList = txns ?? [];
      const kindOf = new Map((cats ?? []).map((c) => [c.id, c.kind]));

      // Group transaction ids by the (category, reimbursable) effect to apply.
      const groups = new Map<
        string,
        { categoryId: string; reimbursable: boolean | null; ids: string[] }
      >();

      for (const t of txList) {
        const eff = categorize(t, rulesList);
        if (!eff || !eff.categoryId) continue;
        // Guard: don't drop an expense into an income category or vice-versa.
        const wanted = t.type === "income" ? "income" : "expense";
        const k = kindOf.get(eff.categoryId);
        if (k && k !== wanted) continue;

        const reimbursable = t.type === "expense" ? eff.reimbursable : null;
        const key = `${eff.categoryId}|${reimbursable}`;
        const g = groups.get(key);
        if (g) g.ids.push(t.id);
        else
          groups.set(key, {
            categoryId: eff.categoryId,
            reimbursable,
            ids: [t.id],
          });
      }

      let updated = 0;
      for (const g of groups.values()) {
        const patch: {
          category_id: string;
          is_reimbursable?: boolean;
          reimbursement_status?: ReimbursementStatus;
        } = { category_id: g.categoryId };
        if (g.reimbursable != null) {
          patch.is_reimbursable = g.reimbursable;
          patch.reimbursement_status = g.reimbursable ? "pending" : "none";
        }
        const { error } = await supabase
          .from("transactions")
          .update(patch)
          .in("id", g.ids);
        if (error) throw error;
        updated += g.ids.length;
      }

      return { updated, scanned: txList.length };
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.transactions() });
      client.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}
