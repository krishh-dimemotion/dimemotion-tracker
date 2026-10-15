// Live chunk: outreach-templates-CRDIkiTw.js
// Export mapping:
//   r -> OUTREACH_TEMPLATES_QUERY_KEY   a -> useOutreachTemplates
//   i -> templatesForChannel            t -> TEMPLATE_PLACEHOLDERS
//   n -> fillTemplate
import { useQuery } from "@tanstack/react-query";
import { db } from "./db";

export const OUTREACH_TEMPLATES_QUERY_KEY = ["outreach_templates"] as const;

export type OutreachTemplate = {
  id: string;
  name: string;
  channel_id: string | null;
  body: string;
  order_index: number;
};

export function useOutreachTemplates() {
  return useQuery({
    queryKey: OUTREACH_TEMPLATES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await db
        .from("outreach_templates")
        .select("id, name, channel_id, body, order_index")
        .order("order_index")
        .order("name");
      if (error) throw error;
      return (data ?? []) as OutreachTemplate[];
    },
    staleTime: 6e4,
  });
}

/** Templates for a channel first, then the ones not tied to any channel. */
export function templatesForChannel(templates: OutreachTemplate[] | null | undefined, channelId?: string | null) {
  const all = templates ?? [];
  return channelId
    ? [...all.filter((t) => t.channel_id === channelId), ...all.filter((t) => !t.channel_id)]
    : all;
}

export const TEMPLATE_PLACEHOLDERS = ["{first_name}", "{name}", "{company}"];

export function fillTemplate(body: string, lead: { name?: string | null; company?: string | null }) {
  const name = (lead.name ?? "").replace(/^@/, "").trim();
  const first = name.split(/\s+/)[0] ?? "";
  return body
    .replace(/\{first_name\}/gi, first)
    .replace(/\{name\}/gi, name)
    .replace(/\{company\}/gi, (lead.company ?? "").trim());
}

export { fillTemplate as renderTemplate };
