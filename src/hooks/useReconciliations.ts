import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Reconciliation, ReconciliationInsert } from "@/lib/types";

/** All reconciliation checkpoints, newest first (latest per account = state). */
export function useReconciliations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.reconciliations,
    enabled: !!user,
    queryFn: async (): Promise<Reconciliation[]> => {
      const { data, error } = await supabase
        .from("reconciliations")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateReconciliation() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<ReconciliationInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("reconciliations")
        .insert({ ...input, user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.reconciliations }),
  });
}
