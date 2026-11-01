import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";

/** One canonical merchant and the descriptors that fold into it. */
export interface MerchantGroup {
  /** Canonical (post-alias) name — the grouping key. */
  canonical: string;
  /** Auto-normalised keys that fold into this group (alias `raw` values). */
  keys: string[];
  /** Distinct raw descriptor examples, for the manager UI. */
  raws: string[];
  entries: number;
}

/**
 * Merchant groups, grouped in the database.
 *
 * The normalisation rule — strip store numbers, state and country tails, case —
 * now lives only in `public.normalize_merchant`. It used to exist twice, here
 * and in SQL, and two copies of a grouping rule drifting apart would split
 * every per-merchant figure with no error to show for it.
 */
export function useMerchantGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.merchantGroups,
    enabled: !!user,
    queryFn: async (): Promise<MerchantGroup[]> => {
      const { data, error } = await supabase
        .from("merchant_groups")
        .select("canonical, keys, raws, entries")
        .order("entries", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        canonical: r.canonical,
        keys: r.keys,
        raws: r.raws,
        entries: Number(r.entries),
      }));
    },
  });
}
