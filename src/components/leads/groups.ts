import type { Lead, Stage, Channel, Country, SenderAccount } from "./types";
import { followupBucketLabel } from "./filters";
import { fmtDate } from "@/lib/format";

export type GroupByKey = "" | "country" | "stage" | "channel" | "status" | "followup" | "date_added" | "tag" | "sender_account";

export function groupLeads(
  leads: Lead[],
  key: GroupByKey,
  lookups: { stages: Stage[]; countries: Country[]; channels: Channel[]; senderAccounts: SenderAccount[]; leadTags: Record<string, string[]> },
): { label: string; leads: Lead[] }[] {
  if (!key) return [{ label: "", leads }];
  const map = new Map<string, Lead[]>();
  const push = (label: string, l: Lead) => {
    const arr = map.get(label) ?? [];
    arr.push(l);
    map.set(label, arr);
  };
  for (const l of leads) {
    if (key === "country") {
      push(lookups.countries.find((c) => c.id === l.country_id)?.name ?? "No country", l);
    } else if (key === "stage") {
      push(lookups.stages.find((s) => s.id === l.stage_id)?.name ?? "No stage", l);
    } else if (key === "channel") {
      push(lookups.channels.find((c) => c.id === l.channel_id)?.name ?? "No channel", l);
    } else if (key === "sender_account") {
      push(lookups.senderAccounts.find((s) => s.id === l.sender_account_id)?.label ?? "No account", l);
    } else if (key === "status") {
      push(l.status ?? "new", l);
    } else if (key === "followup") {
      push(followupBucketLabel(l.next_followup_date), l);
    } else if (key === "date_added") {
      push(fmtDate(l.date_added) || "Unknown", l);
    } else if (key === "tag") {
      const tags = lookups.leadTags[l.id] ?? [];
      if (tags.length === 0) push("No tag", l);
      else tags.forEach((t) => push(t, l));
    }
  }
  return Array.from(map.entries()).map(([label, ls]) => ({ label, leads: ls }));
}
