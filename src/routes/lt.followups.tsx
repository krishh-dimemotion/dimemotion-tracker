// Ported from live chunk lt.followups-BRy1o7RC.js
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Check, ChevronDown, Square, SquareCheckBig, Trash2, X } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import {
  CollapsibleCard,
  DatePicker,
  EmptyState,
  Loading,
  Pill,
  addDaysISO,
  fmtDate,
  toDateInput,
  todayISO,
} from "@/components/live/kit";
import {
  SNOOZE_PRESETS,
  followupBlockReason,
  daysFromToday,
  rescheduleFollowup,
  skipPendingFollowups,
} from "@/lib/live/followup-actions";
import { StagePill, stageById } from "@/components/leads/StagePill";
import { LeadLink } from "@/components/lt/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useChannels, useStages, type Stage } from "@/hooks/useLookups";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/followups")({
  head: () => ({ meta: [{ title: "Follow-ups | Lead Tracker" }] }),
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
  leads: { company_name: string | null; lead_code: string | null; stage_id: string | null; archived: boolean } | null;
};

function FollowupsPage() {
  const qc = useQueryClient();
  const { data: channels } = useChannels();
  const { data: stages } = useStages("lead");
  const [channel, setChannel] = useState("all");
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["all-followups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_followups")
        .select(
          "id,lead_id,sequence_number,scheduled_date,sent_at,channel_id,notes,status,leads(company_name,lead_code,stage_id,archived)",
        )
        .eq("status", "pending")
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FollowupRow[];
    },
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["all-followups"] });

  const markSent = async (id: string) => {
    const { error } = await supabase
      .from("lead_followups")
      .update({ status: "sent", sent_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Follow-up marked as sent");
    refresh();
  };
  const snooze = async (id: string, days: number) => {
    const date = daysFromToday(days);
    const err = await rescheduleFollowup(id, date);
    if (err) return toast.error(err.message);
    toast.success(`Snoozed to ${fmtDate(date)}`);
    refresh();
  };
  const stop = async (leadId: string, name: string) => {
    const err = await skipPendingFollowups(leadId);
    if (err) return toast.error(err.message);
    toast.success(`Follow-ups stopped for ${name}.`);
    refresh();
  };
  const reschedule = async (id: string, value: string) => {
    const date = value ? new Date(value + "T12:00:00").toISOString().slice(0, 10) : null;
    const { error } = await supabase
      .from("lead_followups")
      .update({ scheduled_date: date } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const channelName = (id: string | null) => channels?.find((c) => c.id === id)?.name ?? "-";

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (r) =>
          !(
            followupBlockReason(r.leads, stages) ||
            (channel !== "all" && r.channel_id !== channel) ||
            (stage !== "all" && r.leads?.stage_id !== stage) ||
            (search.trim() && !(r.leads?.company_name ?? "").toLowerCase().includes(search.trim().toLowerCase()))
          ),
      ),
    [data, channel, stage, search, stages],
  );

  const today = todayISO();
  const horizon = addDaysISO(14, today);
  const overdue = rows.filter((r) => r.scheduled_date && r.scheduled_date < today);
  const dueToday = rows.filter((r) => r.scheduled_date === today);
  const upcoming = rows.filter((r) => r.scheduled_date && r.scheduled_date > today && r.scheduled_date <= horizon);

  const toggleOne = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const toggleAll = () => setSelected(allSelected ? [] : allIds);

  const bulkMarkSent = async () => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("lead_followups")
        .update({ status: "sent", sent_at: now } as never)
        .in("id", selected);
      if (error) throw error;
      toast.success(`Marked ${selected.length} follow-ups as sent`);
      setSelected([]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark follow-ups as sent");
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkSnooze = async (days: number) => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    try {
      const date = daysFromToday(days);
      const { error } = await supabase
        .from("lead_followups")
        .update({ scheduled_date: date } as never)
        .in("id", selected);
      if (error) throw error;
      toast.success(`Snoozed ${selected.length} follow-ups to ${fmtDate(date)}`);
      setSelected([]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to snooze follow-ups");
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkStop = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Stop and cancel follow-ups for all ${selected.length} selected items?`)) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from("lead_followups")
        .update({ status: "cancelled" } as never)
        .in("id", selected);
      if (error) throw error;
      toast.success(`Stopped ${selected.length} follow-ups`);
      setSelected([]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stop follow-ups");
    } finally {
      setBulkBusy(false);
    }
  };

  const groupProps = {
    stages,
    channelName,
    selectedIds: selected,
    onToggleOne: toggleOne,
    onMarkSent: markSent,
    onReschedule: reschedule,
    onSnooze: snooze,
    onStop: stop,
  };

  return (
    // live: guide="followups" (repo AppPage has no guide prop)
    <AppPage module="lead" title="Follow-ups" perm="lead.leads">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pro-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-52 text-[13px]"
            />
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-8 w-40 text-[13px]">
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
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-8 w-40 text-[13px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {(stages ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rows.length > 0 && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={toggleAll}>
                {allSelected ? (
                  <SquareCheckBig className="mr-1.5 size-3.5" />
                ) : (
                  <Square className="mr-1.5 size-3.5" />
                )}
                {allSelected ? "Deselect all" : `Select all (${rows.length})`}
              </Button>
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-background/95 backdrop-blur px-4 py-2.5 shadow-md">
            <span className="text-[13px] font-medium text-foreground">
              {selected.length} follow-up{selected.length === 1 ? "" : "s"} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 text-[12px]" disabled={bulkBusy} onClick={() => void bulkMarkSent()}>
                <Check className="mr-1.5 size-3.5" /> Mark all sent
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 text-[12px]" disabled={bulkBusy}>
                    <AlarmClock className="mr-1.5 size-3.5" /> Snooze all <ChevronDown className="ml-1 size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SNOOZE_PRESETS.map((o: { label: string; days: number }) => (
                    <DropdownMenuItem key={o.days} onClick={() => void bulkSnooze(o.days)}>
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-[12px]"
                disabled={bulkBusy}
                onClick={() => void bulkStop()}
              >
                <Trash2 className="mr-1.5 size-3.5" /> Stop all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 size-8 p-0"
                onClick={() => setSelected([])}
                title="Clear selection"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-3">
            <FollowupGroup id="followups.overdue" title="Overdue" tone="negative" rows={overdue} defaultOpen {...groupProps} />
            <FollowupGroup id="followups.today" title="Due today" tone="warning" rows={dueToday} defaultOpen {...groupProps} />
            <FollowupGroup
              id="followups.upcoming"
              title="Upcoming (next 14 days)"
              tone="info"
              rows={upcoming}
              defaultOpen={false}
              {...groupProps}
            />
          </div>
        )}
      </div>
    </AppPage>
  );
}

function FollowupGroup({
  id,
  title,
  tone,
  rows,
  defaultOpen,
  stages,
  channelName,
  selectedIds,
  onToggleOne,
  onMarkSent,
  onReschedule,
  onSnooze,
  onStop,
}: {
  id: string;
  title: string;
  tone: "negative" | "warning" | "info";
  rows: FollowupRow[];
  defaultOpen: boolean;
  stages: Stage[] | undefined;
  channelName: (id: string | null) => string;
  selectedIds: string[];
  onToggleOne: (id: string) => void;
  onMarkSent: (id: string) => void;
  onReschedule: (id: string, value: string) => void;
  onSnooze: (id: string, days: number) => void;
  onStop: (leadId: string, name: string) => void;
}) {
  return (
    <CollapsibleCard
      id={id}
      title={title}
      defaultOpen={defaultOpen}
      actions={
        <span
          className={cn(
            "text-[13px] font-semibold",
            tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning" : "text-info",
          )}
        >
          {rows.length}
        </span>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const isSel = selectedIds.includes(r.id);
            return (
              <div
                key={r.id}
                className={cn(
                  "grid grid-cols-1 items-center gap-x-3 gap-y-2 rounded-lg border p-2.5 transition-colors lg:grid-cols-[auto_minmax(0,1.3fr)_auto_auto_auto_minmax(0,2fr)_auto]",
                  isSel ? "border-primary/50 bg-primary/5" : "border-border/80 hover:bg-subtle/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleOne(r.id)}
                  className="text-muted-foreground hover:text-foreground"
                  title={isSel ? "Deselect" : "Select"}
                >
                  {isSel ? <SquareCheckBig className="size-4 text-primary" /> : <Square className="size-4" />}
                </button>
                <LeadLink
                  id={r.lead_id}
                  className="min-w-0 truncate text-[13px] font-semibold tracking-tight hover:underline hover:underline-offset-4"
                >
                  {r.leads?.company_name ?? "Unknown"}
                </LeadLink>
                <div className="flex items-center gap-2">
                  <span className="label-text">#{r.sequence_number}</span>
                  <StagePill stage={stageById(stages, r.leads?.stage_id ?? null)} />
                </div>
                <Pill>{channelName(r.channel_id)}</Pill>
                <span className="label-text">{fmtDate(r.scheduled_date)}</span>
                <span className="min-w-0 truncate text-[13px] text-muted-foreground" title={r.notes ?? undefined}>
                  {r.notes ?? "-"}
                </span>
                <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                  <DatePicker
                    value={toDateInput(r.scheduled_date)}
                    onChange={(v?: string) => {
                      if (v) onReschedule(r.id, v);
                    }}
                    className="w-[140px] text-[13px]"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" aria-label="Snooze">
                        <AlarmClock className="mr-1 size-3.5" /> Snooze <ChevronDown className="ml-1 size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {SNOOZE_PRESETS.map((o: { label: string; days: number }) => (
                        <DropdownMenuItem key={o.days} onClick={() => onSnooze(r.id, o.days)}>
                          {o.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-negative"
                        onClick={() => onStop(r.lead_id, r.leads?.company_name ?? "this lead")}
                      >
                        Stop follow-ups for this lead
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="sm" variant="outline" onClick={() => onMarkSent(r.id)}>
                    Mark sent
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleCard>
  );
}
