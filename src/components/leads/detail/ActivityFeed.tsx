import { CollapsibleCard, EmptyState } from "@/components/kit";
import { fmtDateTime } from "@/lib/format";

type ActivityEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  meta: unknown;
  profiles?: { full_name: string | null; email: string | null } | null;
};

function eventLabel(e: ActivityEvent): string {
  const map: Record<string, string> = {
    created: "Lead created",
    stage_changed: "Stage changed",
    status_changed: "Status changed",
    email_sent: "Email sent",
    email_viewed: "Email viewed",
    email_replied: "Email replied",
    loom_sent: "Loom sent",
    loom_watched: "Loom watched",
    linkedin_sent: "LinkedIn message sent",
    linkedin_replied: "LinkedIn replied",
    instagram_sent: "Instagram message sent",
    instagram_replied: "Instagram replied",
    meeting_booked: "Meeting booked",
    client_closed: "Client closed",
    pushed_to_crm: "Pushed to CRM",
    archived: "Archived",
    restored: "Restored",
    followup_sent: "Follow-up sent",
    note: "Note added",
  };
  return map[e.event_type] ?? e.event_type.replace(/_/g, " ");
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <CollapsibleCard id="lead.activity" title="Activity">
      {events.length === 0 ? (
        <EmptyState title="No activity yet" hint="Actions on this lead will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((e) => (
            <div key={e.id} className="border-l-2 border-border pl-3">
              <div className="text-[13px]">{eventLabel(e)}</div>
              <div className="label-text mt-0.5">
                {fmtDateTime(e.occurred_at)}
                {e.profiles?.full_name || e.profiles?.email ? ` · ${e.profiles.full_name ?? e.profiles.email}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
