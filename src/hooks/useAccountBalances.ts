import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { BalanceOverride } from "@/lib/investments";

/** One row of the `account_balances` view: a pocket and what is in it. */
export interface AccountBalanceRow {
  account_id: string;
  currency: string;
  balance: number;
}

/**
 * Every pocket's balance, computed in Postgres.
 *
 * The browser used to fetch the whole ledger and fold it up on each render,
 * which made the answer depend on how much of it arrived — and PostgREST caps
 * an unbounded select without saying so. This asks the database the question
 * instead, and gets back one row per pocket however long the ledger grows.
 */
export function useAccountBalances() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.accountBalances,
    enabled: !!user,
    queryFn: async (): Promise<AccountBalanceRow[]> => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("account_id, currency, balance");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Balances keyed by account, with Zenith's valuation layered over the linked
 * ones. An override replaces the ledger figure outright — a linked account is
 * worth whatever the snapshot last said, and the cash transfers into it only
 * move the funding side, so counting both would double it.
 */
export function useBalancesByAccount(
  overrides?: Map<string, BalanceOverride>,
): Map<string, Record<string, number>> {
  const { data: rows = [] } = useAccountBalances();

  return useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const bucket = m.get(r.account_id) ?? {};
      bucket[r.currency] = Number(r.balance);
      m.set(r.account_id, bucket);
    }
    if (overrides) {
      for (const [accountId, ext] of overrides)
        m.set(accountId, { [ext.currency]: ext.value });
    }
    return m;
  }, [rows, overrides]);
}
