import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { CollapsibleCard, EmptyState, Loading, Pill } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useChannels, useStages } from "@/hooks/useLookups";
import { fmtDate, todayISO, addDaysISO, toDateInput } from "@/lib/format";
import { StagePill, stageById } from "@/components/leads/StagePill";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/followups")({
  head: () => ({
    meta: [
      { title: "Follow-ups | Lead Tracker" },
      { name: "description", content: "Overdue, due today and upcoming lead follow-ups in one place." },
      { property: "og:title", content: "Follow-ups | Lead Tracker" },
      { property: "og:description", content: "Overdue, due today and upcoming lead follow-ups in one place." },
    ],
  }),
  component: FollowupsPage,
});

type FollowupRow = {
  id: string;
  lead_id: string;
  sequence_number: number;
  scheduled_date: string | null;
  sent_at: string | null;
  channel_id: string | null;
  notes: string | null;
  status: string;
  leads: {
    company_name: string;
    lead_code: string | null;
    stage_id: string | null;
  } | null;
};

function FollowupsPage() {
  const qc = useQueryClient();
  const { data: channels } = useChannels();
  const { data: stages } = useStages("lead");
  const [channelId, setChannelId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["all-followups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_followups")
        .select("id,lead_id,sequence_number,scheduled_date,sent_at,channel_id,notes,status,leads(company_name,lead_code,stage_id)")
        .neq("status", "sent")
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FollowupRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["all-followups"] });

  const markSent = async (id: string) => {
    const { error } = await supabase.from("lead_followups").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const reschedule = async (id: string, date: string) => {
    const v = date ? new Date(date + "T12:00:00").toISOString().slice(0, 10) : null;
    const { error } = await supabase.from("lead_followups").update({ scheduled_date: v }).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const channelName = (id: string | null) => channels?.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((r) => {
      if (channelId !== "all" && r.channel_id !== channelId) return false;
      if (search.trim() && !(r.leads?.company_name ?? "").toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [data, channelId, search]);

  const today = todayISO();
  const upper14 = addDaysISO(14, today);

  const overdue = filtered.filter((r) => r.scheduled_date && r.scheduled_date < today);
  const dueToday = filtered.filter((r) => r.scheduled_date === today);
  const upcoming = filtered.filter((r) => r.scheduled_date && r.scheduled_date > today && r.scheduled_date <= upper14);

  return (
    <AppPage module="lead" title="Follow-ups" perm="lead.leads">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Input
            placeholder="Search company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 text-[13px]"
          />
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger className="h-8 w-44 text-[13px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {(channels ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-3">
            <FollowupSection
              id="followups.overdue"
              title="Overdue"
              tone="negative"
              rows={overdue}
              defaultOpen={false}
              stages={stages}
              channelName={channelName}
              onMarkSent={markSent}
              onReschedule={reschedule}
            />
            <FollowupSection
              id="followups.today"
              title="Due today"
              tone="warning"
              rows={dueToday}
              defaultOpen={true}
              stages={stages}
              channelName={channelName}
              onMarkSent={markSent}
              onReschedule={reschedule}
            />
            <FollowupSection
              id="followups.upcoming"
              title="Upcoming (next 14 days)"
              tone="info"
              rows={upcoming}
              defaultOpen={false}
              stages={stages}
              channelName={channelName}
              onMarkSent={markSent}
              onReschedule={reschedule}
            />
          </div>
        )}
      </div>
    </AppPage>
  );
}

function FollowupSection({
  id,
  title,
  tone,
  rows,
  defaultOpen,
  stages,
  channelName,
  onMarkSent,
  onReschedule,
}: {
  id: string;
  title: string;
  tone: "negative" | "warning" | "info";
  rows: FollowupRow[];
  defaultOpen: boolean;
  stages: ReturnType<typeof useStages>["data"];
  channelName: (id: string | null) => string;
  onMarkSent: (id: string) => void;
  onReschedule: (id: string, date: string) => void;
}) {
  const toneClass = tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning" : "text-info";
  return (
    <CollapsibleCard
      id={id}
      title={title}
      defaultOpen={defaultOpen}
      actions={<span className={cn("text-[13px] font-semibold", toneClass)}>{rows.length}</span>}
    >
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-1 items-center gap-2 rounded-md border border-border p-2 sm:grid-cols-6">
              <Link
                to="/lt/leads/$id"
                params={{ id: r.lead_id }}
                className="truncate text-[13px] font-medium text-info hover:underline"
              >
                {r.leads?.company_name ?? "Unknown"}
              </Link>
              <div className="flex items-center gap-2">
                <span className="label-text">#{r.sequence_number}</span>
                <StagePill stage={stageById(stages, r.leads?.stage_id ?? null)} />
              </div>
              <Pill>{channelName(r.channel_id)}</Pill>
              <span className="label-text">{fmtDate(r.scheduled_date)}</span>
              <span className="truncate text-[13px] text-muted-foreground">{r.notes ?? "—"}</span>
              <div className="flex items-center justify-end gap-2">
                <Input
                  type="date"
                  className="h-8 w-[140px] text-[13px]"
                  defaultValue={toDateInput(r.scheduled_date)}
                  onChange={(e) => onReschedule(r.id, e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={() => onMarkSent(r.id)}>
                  Mark sent
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
