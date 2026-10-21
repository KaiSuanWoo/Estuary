import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type {
  AccountCurrency,
  AccountCurrencyInsert,
  AccountCurrencyUpdate,
} from "@/lib/types";

/**
 * The declared currency balances — "pockets" — across every account.
 *
 * A pocket exists because there is a row, not because a transaction happened
 * to be denominated in it. That is what lets a Wise hold GBP at 0.00 from the
 * day you open it, and what gives each currency an opening figure of its own.
 */
export function useAccountCurrencies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.accountCurrencies,
    enabled: !!user,
    queryFn: async (): Promise<AccountCurrency[]> => {
      const { data, error } = await supabase
        .from("account_currencies")
        .select("*")
        .order("display_order", { ascending: true })
        .order("currency", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Pockets grouped by account, in display order. */
export function usePocketsByAccount(): Map<string, AccountCurrency[]> {
  const { data = [] } = useAccountCurrencies();
  const map = new Map<string, AccountCurrency[]>();
  for (const p of data) {
    const list = map.get(p.account_id);
    if (list) list.push(p);
    else map.set(p.account_id, [p]);
  }
  return map;
}

function useInvalidate() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: qk.accountCurrencies });
    // Balances are derived from pockets, so anything showing money is stale.
    client.invalidateQueries({ queryKey: qk.accounts });
  };
}

export function useAddPocket() {
  const { user } = useAuth();
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (input: Omit<AccountCurrencyInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("account_currencies")
        .insert({ ...input, user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: done,
  });
}

export function useUpdatePocket() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: AccountCurrencyUpdate }) => {
      const { data, error } = await supabase
        .from("account_currencies")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: done,
  });
}

export function useRemovePocket() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("account_currencies")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}
