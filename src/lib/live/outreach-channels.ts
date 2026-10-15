// Live chunk: outreach-channels-BEigCNIh.js
// Export mapping:
//   a -> CirclePlayIcon (lucide CirclePlay)   i -> SendIcon (lucide Send)
//   t -> OUTREACH_CHANNELS_QUERY_KEY          r -> useOutreachChannels
//   n -> saveOutreachChannels
import { useQuery } from "@tanstack/react-query";
import { db } from "./db";

export { CirclePlay as CirclePlayIcon, Send as SendIcon } from "lucide-react";

const KEY = "outreach_channels";
export const OUTREACH_CHANNELS_QUERY_KEY = ["app_settings", KEY] as const;

export type OutreachKind = "email" | "instagram" | "linkedin";
export type OutreachChannelsSetting = { kinds: OutreachKind[]; custom: string[] };

function parse(value: unknown): OutreachChannelsSetting | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { kinds?: unknown; custom?: unknown };
  return {
    kinds: Array.isArray(v.kinds)
      ? (v.kinds.filter((k) => k === "email" || k === "instagram" || k === "linkedin") as OutreachKind[])
      : [],
    custom: Array.isArray(v.custom)
      ? v.custom.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      : [],
  };
}

export function useOutreachChannels() {
  return useQuery({
    queryKey: OUTREACH_CHANNELS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await db.from("app_settings").select("value").eq("key", KEY).maybeSingle();
      if (error) throw error;
      return data ? parse(data.value) : null;
    },
    staleTime: 3e5,
  });
}

export async function saveOutreachChannels(setting: OutreachChannelsSetting) {
  const custom = [...new Set(setting.custom.map((c) => c.trim()).filter(Boolean))];
  if (custom.length) {
    const { data, error } = await db.from("channels").select("name");
    if (error) throw error;
    const existing = new Set((data ?? []).map((c: { name: string }) => c.name.toLowerCase()));
    const missing = custom.filter((c) => !existing.has(c.toLowerCase()));
    if (missing.length) {
      const { error: insErr } = await db
        .from("channels")
        .insert(missing.map((name) => ({ name, kind: "other" })));
      if (insErr) throw insErr;
    }
  }
  const { error } = await db
    .from("app_settings")
    .upsert({ key: KEY, value: { kinds: setting.kinds, custom } }, { onConflict: "workspace_id,key" });
  if (error) throw error;
}

export { useOutreachChannels as useOutreachChannelsConfig };
