import type { Tables } from "@/integrations/supabase/types";

export type Lead = Tables<"leads">;
export type LeadContact = Tables<"lead_contacts">;
export type LeadLink = Tables<"lead_links">;
export type LeadFollowup = Tables<"lead_followups">;
export type LeadEvent = Tables<"lead_events">;
export type { Stage } from "@/hooks/useLookups";
export type Channel = Tables<"channels">;
export type SenderAccount = Tables<"sender_accounts">;
export type Country = Tables<"countries">;
export type Tag = Tables<"tags">;
export type Profile = Tables<"profiles">;

export const STATUS_OPTIONS = ["new", "in_progress", "on_hold", "won", "lost"] as const;
export const PRIORITY_OPTIONS = ["low", "medium", "high"] as const;
export const SENTIMENT_OPTIONS = ["positive", "neutral", "negative"] as const;

export function followupBucket(dateStr: string | null, todayISO: string): "overdue" | "today" | "upcoming" | "later" | "none" {
  if (!dateStr) return "none";
  if (dateStr < todayISO) return "overdue";
  if (dateStr === todayISO) return "today";
  const d = new Date(todayISO);
  d.setDate(d.getDate() + 7);
  const upperISO = d.toISOString().slice(0, 10);
  if (dateStr <= upperISO) return "upcoming";
  return "later";
}
