import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { linkedInvestmentValues, type BalanceOverride } from "@/lib/investments";
import type {
  Account,
  InvestmentAccount,
  InvestmentHistoryPoint,
  InvestmentSnapshot,
  InvestmentSnapshotInsert,
} from "@/lib/types";

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
 * Balance overrides for Zenith-linked accounts — pass to the `balances.ts`
 * helpers so linked accounts report Zenith's live value instead of the
 * opening-balance ± transactions derivation.
 */
export function useInvestmentOverrides(
  accounts: Account[],
): Map<string, BalanceOverride> {
  const { data: snapshot } = useInvestmentSnapshot();
  return useMemo(
    () => linkedInvestmentValues(accounts, snapshot),
    [accounts, snapshot],
  );
}

/**
 * Mirror snapshot accounts into real `accounts` rows (type 'investment',
 * keyed on external_source/external_key) and archive linked rows that
 * disappeared. The zenith-sync edge function does the same server-side; this
 * client copy keeps the manual-paste import path equivalent.
 */
export function useMaterializeInvestmentAccounts(source = "zenith") {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (snapshotAccounts: InvestmentAccount[]) => {
      if (snapshotAccounts.length > 0) {
        const { error } = await supabase.from("accounts").upsert(
          snapshotAccounts.map((a) => ({
            user_id: user!.id,
            name: a.name,
            type: "investment" as const,
            currency: a.currency,
            external_source: source,
            external_key: a.name,
            is_archived: false,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "user_id,external_source,external_key" },
        );
        if (error) throw error;
      }

      let archive = supabase
        .from("accounts")
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq("user_id", user!.id)
        .eq("external_source", source);
      const keys = snapshotAccounts.map((a) => a.name);
      if (keys.length > 0)
        archive = archive.not(
          "external_key",
          "in",
          `(${keys.map((k) => `"${k.replaceAll('"', '\\"')}"`).join(",")})`,
        );
      const { error } = await archive;
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.accounts }),
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

/** Disconnect Zenith — remove the snapshot row and archive linked accounts. */
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
      const { error: archErr } = await supabase
        .from("accounts")
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq("user_id", user!.id)
        .eq("external_source", source);
      if (archErr) throw archErr;
    },
    onSuccess: () => {
      client.setQueryData(qk.investmentSnapshot, null);
      void client.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}

/**
 * Portfolio value over time, oldest first. Appended by the Zenith sync — one
 * point per day — so the series only ever grows.
 */
export function useInvestmentHistory(source = "zenith") {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.investmentHistory,
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<InvestmentHistoryPoint[]> => {
      const { data, error } = await supabase
        .from("investment_history")
        .select("*")
        .eq("source", source)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
