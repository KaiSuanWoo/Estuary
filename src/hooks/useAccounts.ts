import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Account, AccountInsert, AccountUpdate } from "@/lib/types";

export function useAccounts(includeArchived = false) {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.accounts,
    enabled: !!user,
    queryFn: async (): Promise<Account[]> => {
      let q = supabase
        .from("accounts")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!includeArchived) q = q.eq("is_archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
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
