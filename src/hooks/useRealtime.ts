import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const WATCHED_TABLES = [
  "leads",
  "lead_events",
  "lead_followups",
  "lead_contacts",
  "lead_links",
  "lead_tags",
  "lead_tasks",
  "crm_records",
  "crm_contact_log",
  "outreach_daily",
  "outreach_targets",
  "stages",
  "profiles",
  "user_permissions",
  "permission_presets",
  "followup_templates",
] as const;

/**
 * Subscribes once to all tracker tables and refreshes every cached query when
 * anything changes, so pages stay live without a manual refresh.
 */
export function useGlobalRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries();
      }, 250);
    };

    const channel = supabase.channel("tracker-realtime");
    for (const table of WATCHED_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
