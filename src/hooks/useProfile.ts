import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Profile } from "@/lib/types";

/**
 * The signed-in user's own profile row — carries beta `status`
 * (pending/approved/rejected) and the `is_admin` flag. The row is created
 * automatically by a DB trigger on sign-up, so we only ever read it here.
 */
export function useProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.profile,
    enabled: !!user,
    // Access state is sensitive to staleness (an admin may just have approved
    // them), so keep it fresh on focus rather than the global 30s cache.
    staleTime: 0,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Admin-only: every profile, newest first, for the approvals queue. */
export function useAllProfiles(enabled: boolean) {
  return useQuery({
    queryKey: qk.profilesAll,
    enabled,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Admin-only: set a user's access status. RLS rejects this for non-admins. */
export function useSetProfileStatus() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "approved" | "rejected" | "pending";
    }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          status,
          approved_at: status === "approved" ? new Date().toISOString() : null,
          approved_by: status === "approved" ? user!.id : null,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.profilesAll });
      client.invalidateQueries({ queryKey: qk.profile });
    },
  });
}
