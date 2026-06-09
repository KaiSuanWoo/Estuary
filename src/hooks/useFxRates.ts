import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/format";
import { buildRateMap, fetchLiveRates, mergeLiveRates, type RateMap } from "@/lib/fx";
import { useBaseCurrency } from "@/hooks/useSettings";
import type { FxRate } from "@/lib/types";

export function useFxRates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.fxRates,
    enabled: !!user,
    queryFn: async (): Promise<FxRate[]> => {
      const { data, error } = await supabase
        .from("fx_rates")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Live rates from the Frankfurter public API (ECB, no key needed).
 * Stays fresh for 4 hours; re-fetches in the background when stale.
 */
export function useLiveRates(base: string) {
  return useQuery({
    queryKey: qk.liveRates(base),
    enabled: !!base,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours
    retry: 2,
    queryFn: () => fetchLiveRates(base),
  });
}

/**
 * Rate lookup map for currency conversion.
 * Merges stored (manual/Supabase) rates with live ECB rates.
 * Stored rates take precedence so manual overrides are respected.
 */
export function useRateMap(): RateMap {
  const baseCurrency = useBaseCurrency();
  const { data: stored = [] } = useFxRates();
  const { data: live } = useLiveRates(baseCurrency);

  const base = buildRateMap(stored);
  return live ? mergeLiveRates(base, live) : base;
}

export function useUpsertFxRate() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { base: string; quote: string; rate: number }) => {
      const { data, error } = await supabase
        .from("fx_rates")
        .upsert(
          {
            ...input,
            user_id: user!.id,
            date: todayISO(),
            source: "manual",
          },
          { onConflict: "user_id,base,quote,date" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.fxRates }),
  });
}
