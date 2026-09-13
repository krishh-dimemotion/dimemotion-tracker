import {
  Activity,
  ArchiveRestore,
  Archive as ArchiveIcon,
  Flag,
  Link2,
  Linkedin,
  Mail,
  MessageSquare,
  PlayCircle,
  PlusCircle,
  StickyNote,
  Upload,
} from "lucide-react";
import { CollapsibleCard, EmptyState } from "@/components/kit";
import { fmtDateTime } from "@/lib/format";

type ActivityEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  meta: unknown;
  profiles?: { full_name: string | null; email: string | null } | null;
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  created: PlusCircle,
  stage_changed: Flag,
  status_changed: Flag,
  priority_changed: Flag,
  email_sent: Mail,
  email_viewed: Mail,
  email_replied: Mail,
  loom_sent: PlayCircle,
  loom_watched: PlayCircle,
  linkedin_connection_sent: Linkedin,
  linkedin_sent: Linkedin,
  linkedin_replied: Linkedin,
  instagram_sent: MessageSquare,
  instagram_replied: MessageSquare,
  meeting_booked: Activity,
  client_closed: Activity,
  pushed_to_crm: Upload,
  archived: ArchiveIcon,
  restored: ArchiveRestore,
  followup_sent: Link2,
  note: StickyNote,
};

function getMeta(e: ActivityEvent): { from?: string; to?: string } {
  if (e.meta && typeof e.meta === "object") return e.meta as { from?: string; to?: string };
  return {};
}

function eventLabel(e: ActivityEvent): string {
  const meta = getMeta(e);

  if (e.event_type === "stage_changed" && meta.from && meta.to) {
    return `Stage changed from ${meta.from} to ${meta.to}`;
  }
  if (e.event_type === "status_changed" && meta.from && meta.to) {
    return `Status changed from ${meta.from} to ${meta.to}`;
  }
  if (e.event_type === "priority_changed" && meta.from && meta.to) {
    return `Priority changed from ${meta.from} to ${meta.to}`;
  }

  const map: Record<string, string> = {
    created: "Lead created",
    stage_changed: "Stage changed",
    status_changed: "Status changed",
    priority_changed: "Priority changed",
    email_sent: "Email sent",
    email_viewed: "Email viewed",
    email_replied: "Email replied",
    loom_sent: "Loom sent",
    loom_watched: "Loom watched",
    linkedin_connection_sent: "LinkedIn connection request sent",
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
          {events.map((e) => {
            const Icon = ICON_MAP[e.event_type] ?? Activity;
            return (
              <div key={e.id} className="flex gap-2 border-l-2 border-border pl-3">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-[13px]">{eventLabel(e)}</div>
                  <div className="label-text mt-0.5">
                    {fmtDateTime(e.occurred_at)}
                    {e.profiles?.full_name || e.profiles?.email ? ` · ${e.profiles.full_name ?? e.profiles.email}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleCard>
  );
}
