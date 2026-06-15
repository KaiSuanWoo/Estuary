import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Tag } from "@/lib/types";

export function useTags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.tags,
    enabled: !!user,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTag() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string): Promise<Tag> => {
      const { data, error } = await supabase
        .from("tags")
        .insert({ user_id: user!.id, name: name.trim() })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.tags }),
  });
}

/** The tag ids attached to one transaction. */
export function useTransactionTags(txnId: string | undefined) {
  return useQuery({
    queryKey: qk.txnTags(txnId ?? ""),
    enabled: !!txnId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("transaction_tags")
        .select("tag_id")
        .eq("transaction_id", txnId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.tag_id);
    },
  });
}

/** Replace a transaction's tag set (delete all, insert the chosen ones). */
export function useSetTransactionTags() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      transactionId,
      tagIds,
    }: {
      transactionId: string;
      tagIds: string[];
    }) => {
      const { error: delErr } = await supabase
        .from("transaction_tags")
        .delete()
        .eq("transaction_id", transactionId);
      if (delErr) throw delErr;
      if (tagIds.length > 0) {
        const { error: insErr } = await supabase
          .from("transaction_tags")
          .insert(tagIds.map((tag_id) => ({ transaction_id: transactionId, tag_id })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_d, v) => {
      client.invalidateQueries({ queryKey: qk.txnTags(v.transactionId) });
      client.invalidateQueries({ queryKey: qk.transactionTags });
    },
  });
}

/** All (tag_id, transaction_id) pairs for the user — for budget spend rollups. */
export function useAllTransactionTags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.transactionTags,
    enabled: !!user,
    queryFn: async (): Promise<{ tag_id: string; transaction_id: string }[]> => {
      const { data, error } = await supabase
        .from("transaction_tags")
        .select("tag_id, transaction_id");
      if (error) throw error;
      return data ?? [];
    },
  });
}
