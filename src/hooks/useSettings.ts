import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { qk } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import type { Settings, SettingsUpdate } from "@/lib/types";

/** The signed-in user's settings row, creating a default on first load. */
export function useSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: qk.settings,
    enabled: !!user,
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // First run for this user — seed a default row.
      const { data: created, error: insertErr } = await supabase
        .from("settings")
        .insert({ user_id: user!.id })
        .select("*")
        .single();
      if (insertErr) throw insertErr;
      return created;
    },
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (patch: SettingsUpdate) => {
      const { data, error } = await supabase
        .from("settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("user_id", user!.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => client.setQueryData(qk.settings, data),
  });
}

/** Convenience: the user's base/display currency (defaults to AUD). */
export function useBaseCurrency(): string {
  const { data } = useSettings();
  return data?.base_currency ?? "AUD";
}
