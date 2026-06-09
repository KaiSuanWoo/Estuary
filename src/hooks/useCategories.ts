import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Category, CategoryInsert, CategoryUpdate } from "@/lib/types";

export function useCategories() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.categories,
    enabled: !!user,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_archived", false)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** id → category lookup, handy for rendering transaction rows. */
export function useCategoryMap() {
  const { data } = useCategories();
  const map = new Map<string, Category>();
  for (const c of data ?? []) map.set(c.id, c);
  return map;
}

export function useCreateCategory() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<CategoryInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("categories")
        .insert({ ...input, user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.categories }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CategoryUpdate }) => {
      const { data, error } = await supabase
        .from("categories")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.categories }),
  });
}

/** Soft delete: archived categories drop out of pickers but keep history intact. */
export function useArchiveCategory() {
  const update = useUpdateCategory();
  return (id: string) => update.mutate({ id, patch: { is_archived: true } });
}

export interface SeedCategory {
  name: string;
  kind: "expense" | "income";
  color: string;
}

/**
 * Bulk-insert a starter set of categories in a single round-trip.
 * Intended to be called once from the empty-state "Set up defaults" button.
 */
export function useSeedCategories() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (seeds: SeedCategory[]) => {
      const inserts = seeds.map((s, i) => ({
        user_id: user!.id,
        name: s.name,
        kind: s.kind,
        color: s.color,
        display_order: i,
        monthly_budget: null as number | null,
      }));
      const { error } = await supabase.from("categories").insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.categories }),
  });
}
