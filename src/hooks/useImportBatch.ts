import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { ImportBatch, ReimbursementStatus } from "@/lib/types";

export interface ImportRow {
  /**
   * expense / income — normal P&L transactions.
   * transfer   — money leaving this account to another own account (balance ↓, excluded from P&L).
   * adjustment — money arriving from another own account (balance ↑, excluded from P&L).
   *              Using the existing "adjustment" DB type avoids needing excluded_from_cashflow.
   */
  type: "expense" | "income" | "transfer" | "adjustment";
  date: string;       // ISO YYYY-MM-DD
  amount: number;     // positive
  currency: string;
  account_id: string;
  merchant: string | null;
  notes: string | null;
  external_id?: string | null;
  /** Set by auto-categorisation rules at import time. */
  category_id?: string | null;
  is_reimbursable?: boolean;
  /** Auto-flagged at import for review (e.g. a likely duplicate transfer). */
  flagged?: boolean;
}

export interface ImportResult {
  batchId: string;
  count: number;
}

/**
 * Create an import batch and bulk-insert all rows in a single round-trip.
 * Groups transactions under import_batches so the import is reversible.
 */
export function useBulkImport() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      fileName,
      source,
      rows,
    }: {
      fileName: string;
      source: string;
      rows: ImportRow[];
    }): Promise<ImportResult> => {
      // 1. Create the batch record
      const { data: batch, error: batchErr } = await supabase
        .from("import_batches")
        .insert({
          user_id: user!.id,
          source,
          file_name: fileName,
          row_count: rows.length,
        })
        .select("id")
        .single();
      if (batchErr) throw batchErr;

      // 2. Bulk-insert all transactions tagged to this batch
      const inserts = rows.map((r) => ({
        user_id: user!.id,
        account_id: r.account_id,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        date: r.date,
        merchant: r.merchant,
        notes: r.notes,
        category_id: r.category_id ?? null,
        is_reimbursable: r.is_reimbursable ?? false,
        reimbursement_status: (r.is_reimbursable
          ? "pending"
          : "none") as ReimbursementStatus,
        import_batch_id: batch.id,
        external_id: r.external_id ?? null,
        flagged: r.flagged ?? false,
      }));

      const { error: txErr } = await supabase
        .from("transactions")
        .insert(inserts);
      if (txErr) throw txErr;

      return { batchId: batch.id, count: rows.length };
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.transactions() });
      client.invalidateQueries({ queryKey: qk.accounts });
      client.invalidateQueries({ queryKey: qk.importBatches });
    },
  });
}

/** Fetch recent committed import batches, newest first. */
export function useImportBatches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.importBatches,
    enabled: !!user,
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .eq("status", "committed")
        .order("imported_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Delete all transactions in an import batch and mark it as reverted.
 * This is the "undo" action for a CSV import.
 */
export function useDeleteBatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      // Delete transactions first (import_batches → transactions FK is set-null on delete,
      // so we must remove transactions before the batch record, not the other way around)
      const { error: txErr } = await supabase
        .from("transactions")
        .delete()
        .eq("import_batch_id", batchId);
      if (txErr) throw txErr;

      // Mark batch as reverted (keeps a thin audit trail)
      const { error: batchErr } = await supabase
        .from("import_batches")
        .update({ status: "reverted" })
        .eq("id", batchId);
      if (batchErr) throw batchErr;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.importBatches });
      client.invalidateQueries({ queryKey: qk.transactions() });
      client.invalidateQueries({ queryKey: qk.accounts });
    },
  });
}
