// Live chunk: followup-actions-C-4q76UT.js
// Export mapping:
//   n -> followupBlockReason      t -> SNOOZE_PRESETS
//   a -> rescheduleFollowup       i -> daysFromToday
//   o -> skipPendingFollowups     r -> resumeSkippedFollowups
import { db } from "./db";
import { addDaysISO, todayISO } from "@/components/live/kit";

type StageFlags = { id: string; is_lost?: boolean | null; is_won?: boolean | null; is_reply_stage?: boolean | null };

/** Why a lead's follow-ups are on hold, or null if they should run. */
export function followupBlockReason(
  lead: { archived?: boolean | null; stage_id?: string | null } | null | undefined,
  stages: StageFlags[] | null | undefined,
) {
  if (!lead) return null;
  if (lead.archived) return "archived";
  const stage = lead.stage_id ? stages?.find((s) => s.id === lead.stage_id) : undefined;
  if (!stage) return null;
  return stage.is_lost ? "Lost" : stage.is_won ? "Won" : stage.is_reply_stage ? "Replied" : null;
}

export const SNOOZE_PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In 1 week", days: 7 },
];

export async function rescheduleFollowup(id: string, date: string) {
  const { error } = await db
    .from("lead_followups")
    .update({ scheduled_date: date, status: "pending" })
    .eq("id", id);
  return error;
}

export function daysFromToday(days: number) {
  return addDaysISO(days, todayISO());
}

export async function skipPendingFollowups(leadId: string) {
  const { error } = await db
    .from("lead_followups")
    .update({ status: "skipped" })
    .eq("lead_id", leadId)
    .eq("status", "pending");
  return error;
}

export async function resumeSkippedFollowups(leadId: string) {
  const { error } = await db
    .from("lead_followups")
    .update({ status: "pending" })
    .eq("lead_id", leadId)
    .eq("status", "skipped");
  return error;
}

// Aliases used by parallel ports.
export {
  followupBlockReason as followupPauseReason,
  skipPendingFollowups as stopFollowups,
  resumeSkippedFollowups as resumeFollowups,
};
