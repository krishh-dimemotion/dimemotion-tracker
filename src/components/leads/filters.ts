import { todayISO } from "@/lib/format";

export type LeadFilters = {
  search: string;
  stageId: string;
  countryId: string;
  channelId: string;
  senderAccountId: string;
  status: string;
  tagId: string;
  dateFrom: string;
  dateTo: string;
  hasReplied: "" | "yes" | "no";
  hasLoomSent: "" | "yes" | "no";
};

export const EMPTY_FILTERS: LeadFilters = {
  search: "",
  stageId: "",
  countryId: "",
  channelId: "",
  senderAccountId: "",
  status: "",
  tagId: "",
  dateFrom: "",
  dateTo: "",
  hasReplied: "",
  hasLoomSent: "",
};

export function followupBucketLabel(dateStr: string | null): string {
  if (!dateStr) return "No follow-up";
  const today = todayISO();
  const upper = new Date(today);
  upper.setDate(upper.getDate() + 7);
  const upperISO = upper.toISOString().slice(0, 10);
  if (dateStr < today) return "Overdue";
  if (dateStr === today) return "Today";
  if (dateStr <= upperISO) return "Upcoming (7d)";
  return "Later";
}
