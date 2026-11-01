import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllPages, supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { useBaseCurrency } from "@/hooks/useSettings";
import { useRateMap } from "@/hooks/useFxRates";
import { convert } from "@/lib/fx";
import { reimbursementLinks } from "@/lib/reimbursements";
import type { Transaction, TransactionInsert, TransactionUpdate } from "@/lib/types";

/*
 * `useTransactions` — the whole-ledger fetch — used to live here.
 *
 * Nothing needs it any more. Every screen that called it was folding the rows
 * up into one figure, and those figures are grouped in the database now; the
 * three places that genuinely want rows ask for the rows they want
 * (`useTransactionsByIds`, `useTransferIns`, the paged Activity list).
 *
 * It is deleted rather than left exported, because it was the shape of the
 * original bug: PostgREST caps an unbounded select at 1000 rows without
 * saying so, and the next caller to reach for it would have reintroduced a
 * total that quietly disagrees with the ledger.
 */

/**
 * Balance immediately after each entry in one account, keyed by transaction id.
 *
 * This was the last reason the Activity list fetched the whole ledger: one
 * column, on one screen, when a single account is selected. The database runs
 * the same accumulation as a window function and returns the account's rows
 * alone.
 */
export function useRunningBalance(accountId: string | undefined) {
  const { user } = useAuth();

  const { data = [] } = useQuery({
    queryKey: qk.runningBalance(accountId ?? ""),
    enabled: !!user && !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_running_balance")
        .select("transaction_id, balance_after")
        .eq("account_id", accountId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(
    () => new Map(data.map((r) => [r.transaction_id, Number(r.balance_after)])),
    [data],
  );
}

/**
 * Inbound transfers into one account: amount as it landed, and the date.
 *
 * The importer uses these to flag a likely duplicate — a Wise→CommBank top-up
 * that the bank's own CSV also lists as a plain credit, which would otherwise
 * be counted twice. It used to filter them out of a full-ledger fetch, which
 * is a scan for what is really a two-column query on one account.
 */
export function useTransferIns(accountId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["transactions", "transfer_ins", accountId ?? null] as const,
    enabled: !!user && !!accountId,
    queryFn: async (): Promise<{ amt: number; date: string }[]> => {
      const rows = await fetchAllPages((from, to) =>
        supabase
          .from("transactions")
          .select("amount, destination_amount, date")
          .eq("type", "transfer")
          .eq("destination_account_id", accountId!)
          .range(from, to),
      );
      return rows.map((t) => ({
        amt: Number(t.destination_amount ?? t.amount),
        date: t.date,
      }));
    },
  });
}

export function useCreateTransaction() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<TransactionInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...input, user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.transactions() });
      client.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}

export function useUpdateTransaction() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Omit<TransactionUpdate, "user_id">;
    }) => {
      const { data, error } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.transactions() });
      client.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}

/**
 * Reimbursable expenses that haven't been fully settled yet.
 * Used to populate the "link as reimbursement" picker on income transactions.
 */
/**
 * Every repayment income, with its links intact.
 *
 * `useReimbursedAmountMap` collapses these to a per-expense total, which is all
 * a summary needs; showing an expense *what* paid it back needs the rows.
 */
export function useRepayments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", "repayments"] as const,
    enabled: !!user,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "income")
        .not("reimbursement_links", "is", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReimbursableExpenses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["transactions", "reimbursable"] as const,
    enabled: !!user,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "expense")
        .eq("is_reimbursable", true)
        .neq("reimbursement_status", "settled")
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Fetch specific transactions by id (e.g. expenses already linked to a repayment). */
export function useTransactionsByIds(ids: string[]) {
  const { user } = useAuth();
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: ["transactions", "by_ids", sorted] as const,
    enabled: !!user && sorted.length > 0,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .in("id", sorted);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Map of expenseId → total reimbursed, expressed in the **base currency**.
 *
 * Using base currency as the common unit means cross-currency reimbursements
 * are handled correctly — e.g. an AUD income linked to a MYR expense is
 * converted via the live/stored rate before being summed.
 *
 * Callers should convert back to the expense's own currency before displaying
 * a net amount (e.g. using `convert(baseAmt, baseCurrency, tx.currency, rates)`).
 */
export function useReimbursedAmountMap(): Map<string, number> {
  const { user } = useAuth();
  const baseCurrency = useBaseCurrency();
  const rates = useRateMap();

  const { data = [] } = useQuery({
    queryKey: ["transactions", "reimbursements_index"] as const,
    enabled: !!user,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "income")
        .not("reimbursement_links", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of data) {
      // Each income may allocate to several expenses; convert each allocation
      // to base currency so cross-currency pairs compare correctly.
      for (const link of reimbursementLinks(tx)) {
        const inBase =
          convert(link.amount, tx.currency, baseCurrency, rates) ?? link.amount;
        map.set(link.expense_id, (map.get(link.expense_id) ?? 0) + inBase);
      }
    }
    return map;
  }, [data, baseCurrency, rates]);
}

export function useDeleteTransaction() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.transactions() });
      client.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}
