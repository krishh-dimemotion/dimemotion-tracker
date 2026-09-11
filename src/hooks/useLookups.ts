import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Stage = {
  id: string;
  name: string;
  color: string;
  order_index: number;
  board: "lead" | "crm";
  is_won: boolean;
  is_lost: boolean;
  is_reply_stage: boolean;
  default_probability: number;
};

export function useStages(board?: "lead" | "crm") {
  return useQuery({
    queryKey: ["stages", board ?? "all"],
    queryFn: async () => {
      let q = supabase.from("stages").select("*").order("order_index");
      if (board) q = q.eq("board", board);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Stage[];
    },
  });
}

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("channels").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSenderAccounts() {
  return useQuery({
    queryKey: ["sender_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sender_accounts").select("*").order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCountries(activeOnly = true) {
  return useQuery({
    queryKey: ["countries", activeOnly],
    queryFn: async () => {
      let q = supabase.from("countries").select("*").order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOutreachTargets() {
  return useQuery({
    queryKey: ["outreach_targets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_targets").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}
