import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { InvestmentSnapshot, InvestmentSnapshotInsert } from "@/lib/types";

/**
 * The latest external investment snapshot (Zenith) for the signed-in user.
 * Zenith writes the row directly to the shared table; this query refetches on
 * focus so switching back to Estuary picks up Zenith's newest push.
 */
export function useInvestmentSnapshot(source = "zenith") {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.investmentSnapshot,
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<InvestmentSnapshot | null> => {
      const { data, error } = await supabase
        .from("investment_snapshots")
        .select("*")
        .eq("source", source)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/**
 * Upsert the snapshot manually — the import fallback for when Zenith can't write
 * directly (and how a test seeds one). Keyed on (user_id, source).
 */
export function useUpsertInvestmentSnapshot() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<InvestmentSnapshotInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("investment_snapshots")
        .upsert(
          {
            ...input,
            source: input.source ?? "zenith",
            user_id: user!.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,source" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => client.setQueryData(qk.investmentSnapshot, data),
  });
}

/** Disconnect Zenith — remove the snapshot row. */
export function useClearInvestmentSnapshot() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (source: string) => {
      const { error } = await supabase
        .from("investment_snapshots")
        .delete()
        .eq("user_id", user!.id)
        .eq("source", source);
      if (error) throw error;
    },
    onSuccess: () => client.setQueryData(qk.investmentSnapshot, null),
  });
}
