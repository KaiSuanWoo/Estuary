import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { buildAliasMap } from "@/lib/merchants";
import type { MerchantAlias } from "@/lib/types";

export function useMerchantAliases() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.merchantAliases,
    enabled: !!user,
    queryFn: async (): Promise<MerchantAlias[]> => {
      const { data, error } = await supabase.from("merchant_aliases").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Lookup map (normalised raw, lowercased → canonical) for grouping. */
export function useAliasMap(): Map<string, string> {
  const { data = [] } = useMerchantAliases();
  return useMemo(() => buildAliasMap(data), [data]);
}

/**
 * Rename a merchant group: every auto-normalised key in the group gets an
 * alias row pointing at the new canonical name.
 */
export function useRenameMerchant() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ keys, canonical }: { keys: string[]; canonical: string }) => {
      const { error } = await supabase.from("merchant_aliases").upsert(
        keys.map((raw) => ({ user_id: user!.id, raw, canonical })),
        { onConflict: "user_id,raw" },
      );
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.merchantAliases }),
  });
}

/** Undo a rename — drop the alias rows for these keys. */
export function useClearMerchantAliases() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (keys: string[]) => {
      const { error } = await supabase
        .from("merchant_aliases")
        .delete()
        .eq("user_id", user!.id)
        .in("raw", keys);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.merchantAliases }),
  });
}
