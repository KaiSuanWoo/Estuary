import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Account, AccountInsert, AccountUpdate, AccountUsage } from "@/lib/types";

/** The live accounts — everything not archived. */
export function useAccounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.accounts,
    enabled: !!user,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_archived", false)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The archived accounts, newest change first.
 *
 * A separate hook rather than a flag on `useAccounts`: this used to be
 * `useAccounts(includeArchived)`, which kept the same query key either way, so
 * the first caller to pass `true` would have served archived rows to every
 * screen reading the live list — and `qk.accounts` is what the whole app
 * invalidates. The key here still starts with "accounts", so those same
 * invalidations clear it by prefix.
 */
export function useArchivedAccounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.archivedAccounts,
    enabled: !!user,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_archived", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * How much history each account holds, keyed by account id.
 *
 * Deleting an account cascades to its transactions and blanks the destination
 * leg of transfers into it, so the confirmation needs to be able to say what
 * would go. An empty archived shell and one holding years of statements look
 * the same in the list otherwise.
 */
export function useAccountUsage() {
  const { user } = useAuth();

  const { data = [] } = useQuery({
    queryKey: qk.accountUsage,
    enabled: !!user,
    queryFn: async (): Promise<AccountUsage[]> => {
      const { data, error } = await supabase
        .from("account_usage")
        .select("account_id, transaction_count, incoming_transfer_count, first_entry, last_entry");
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(() => new Map(data.map((u) => [u.account_id, u])), [data]);
}

export function useCreateAccount() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<AccountInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("accounts")
        .insert({ ...input, user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.accounts }),
  });
}

export function useUpdateAccount() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Omit<AccountUpdate, "user_id">;
    }) => {
      const { data, error } = await supabase
        .from("accounts")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.accounts }),
  });
}

export function useArchiveAccount() {
  const update = useUpdateAccount();
  return (id: string) => update.mutate({ id, patch: { is_archived: true } });
}

/**
 * Bring an archived account back into the live list.
 *
 * It keeps its `display_order`, which on an account archived long ago may
 * collide with a live one — the list's second sort key (`created_at`) breaks
 * the tie, and the next drag rewrites every index anyway.
 */
export function useRestoreAccount() {
  const update = useUpdateAccount();
  return (id: string) => update.mutate({ id, patch: { is_archived: false } });
}

/**
 * Delete an account outright — only ever offered for an archived one.
 *
 * This is not the inverse of archiving. `transactions.account_id` cascades, so
 * every entry booked to the account goes with it, and
 * `destination_account_id` is ON DELETE SET NULL, so a transfer that landed
 * here keeps its outgoing leg and loses the incoming one — the money leaves
 * the source account and arrives nowhere. Callers must confirm against
 * `useAccountUsage` first; there is no undo.
 */
export function useDeleteAccount() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.accounts }),
  });
}

/**
 * Persist a new account order. Takes the account ids in their desired order and
 * writes each one's `display_order` to its index. The first account (index 0)
 * is the user's default — it's what the new-transaction form preselects.
 *
 * Optimistically reorders the cache so the list doesn't flash on drop.
 */
export function useReorderAccounts() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from("accounts")
            .update({ display_order: i })
            .eq("id", id)
            .then(({ error }) => {
              if (error) throw error;
            }),
        ),
      );
    },
    onMutate: async (orderedIds: string[]) => {
      await client.cancelQueries({ queryKey: qk.accounts });
      const prev = client.getQueryData<Account[]>(qk.accounts);
      if (prev) {
        const byId = new Map(prev.map((a) => [a.id, a]));
        const next = orderedIds
          .map((id, i) => {
            const a = byId.get(id);
            return a ? { ...a, display_order: i } : null;
          })
          .filter((a): a is Account => a !== null);
        client.setQueryData(qk.accounts, next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(qk.accounts, ctx.prev);
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.accounts }),
  });
}
