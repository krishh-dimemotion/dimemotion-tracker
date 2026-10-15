// Ported from the activity + to-do widgets bundled inside the live app-shell chunk
// (xa, Sa, Ca, wa, Da, Oa, ka, Aa, ja, Ma, Na, Pa, Fa, Ia, La, Ra, za, Ya).
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  ArchiveRestore,
  Check,
  CirclePlay,
  CirclePlus,
  Flag,
  Instagram,
  Link2,
  Linkedin,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useProfiles } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollapsibleCard, DatePicker, fmtDate, fmtDateTime } from "@/components/live/kit";
import { autoStageForOutreach } from "@/lib/live/config";

const db = supabase as any;

/* ------------------------------------------------------------------ to-dos */

export const TASK_SELECT = "*, leads(id,company_name,lead_code)";

export type LeadTask = {
  id: string;
  lead_id: string;
  title: string;
  due_date: string | null;
  assignee_id: string | null;
  completed_at: string | null;
  created_at?: string;
  leads?: { id: string; company_name: string; lead_code: string } | null;
};

export function useTaskMutations(onDone?: () => void) {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["lead_tasks"] });
    onDone?.();
  };
  return {
    add: useMutation({
      mutationFn: async (row: Partial<LeadTask>) => {
        const { error } = await db.from("lead_tasks").insert(row);
        if (error) throw error;
      },
      onSuccess: done,
      onError: (e: any) => toast.error(e.message ?? "Could not add the task"),
    }),
    update: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: Partial<LeadTask> }) => {
        const { error } = await db.from("lead_tasks").update(patch).eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
      onError: (e: any) => toast.error(e.message ?? "Could not save the task"),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await db.from("lead_tasks").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
      onError: (e: any) => toast.error(e.message ?? "Could not delete the task"),
    }),
  };
}

export function TaskRow({ task, canEdit, showLead = false }: { task: LeadTask; canEdit: boolean; showLead?: boolean }) {
  const { update, remove } = useTaskMutations();
  const { data: profiles } = useProfiles();
  const owner = (profiles ?? []).find((p) => p.id === task.assignee_id);
  const done = !!task.completed_at;
  const overdue = !done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
      <input
        type="checkbox"
        checked={done}
        disabled={!canEdit}
        onChange={(e) =>
          update.mutate({ id: task.id, patch: { completed_at: e.target.checked ? new Date().toISOString() : null } })
        }
      />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13px]", done && "text-muted-foreground line-through")}>{task.title}</div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {showLead && task.leads ? <span>{task.leads.company_name}</span> : null}
          {task.due_date ? <span className={cn(overdue && "text-destructive")}>Due {fmtDate(task.due_date)}</span> : null}
          {owner ? <span>{owner.full_name || owner.email}</span> : null}
        </div>
      </div>
      {canEdit && (
        <Button variant="ghost" size="icon" className="size-7" onClick={() => remove.mutate(task.id)}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

export function TaskComposer({ leadId, canEdit, onAdded }: { leadId: string; canEdit: boolean; onAdded?: () => void }) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { add } = useTaskMutations(onAdded);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState(user?.id ?? "");
  const submit = () => {
    if (!title.trim()) return;
    add.mutate(
      { lead_id: leadId, title: title.trim(), due_date: due || null, assignee_id: assignee || null },
      {
        onSuccess: () => {
          setTitle("");
          setDue("");
        },
      },
    );
  };
  if (!canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Add a to-do"
        className="h-8 min-w-[180px] flex-1 text-[13px]"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <DatePicker
        value={due || undefined}
        onChange={(v: string | null | undefined) => setDue(v || "")}
        placeholder="Due date"
        className="w-[150px] text-[13px]"
      />
      <Select value={assignee || undefined} onValueChange={setAssignee}>
        <SelectTrigger className="h-8 w-[160px] text-[12px]">
          <SelectValue placeholder="Owner" />
        </SelectTrigger>
        <SelectContent>
          {(profiles ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name || p.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={submit} disabled={add.isPending}>
        <Plus className="mr-1 size-3.5" /> Add
      </Button>
    </div>
  );
}

export function LeadTasksCard({
  leadId,
  canEdit,
  cardId = "lead.todos",
}: {
  leadId: string;
  canEdit: boolean;
  cardId?: string;
}) {
  const [showDone, setShowDone] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["lead_tasks", "lead", leadId],
    queryFn: async () => {
      const { data, error } = await db
        .from("lead_tasks")
        .select(TASK_SELECT)
        .eq("lead_id", leadId)
        .order("completed_at", { ascending: true, nullsFirst: true })
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LeadTask[];
    },
  });
  const all = data ?? [];
  const open = all.filter((t) => !t.completed_at);
  const done = all.filter((t) => t.completed_at);
  return (
    <CollapsibleCard
      id={cardId}
      title="To-dos"
      actions={<span className="text-[12px] text-muted-foreground">{open.length} open</span>}
    >
      <div className="flex flex-col gap-3">
        <TaskComposer leadId={leadId} canEdit={canEdit} />
        {isLoading ? (
          <div className="text-[12px] text-muted-foreground">Loading</div>
        ) : open.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">Nothing to do here yet.</div>
        ) : (
          open.map((t) => <TaskRow key={t.id} task={t} canEdit={canEdit} />)
        )}
        {done.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="w-fit text-[12px] text-muted-foreground hover:text-foreground"
            >
              {showDone ? "Hide" : "Show"} completed ({done.length})
            </button>
            {showDone && done.map((t) => <TaskRow key={t.id} task={t} canEdit={canEdit} />)}
          </>
        )}
      </div>
    </CollapsibleCard>
  );
}

/* ---------------------------------------------------------------- activity */

export type LeadEvent = {
  id: string;
  lead_id: string | null;
  event_type: string;
  occurred_at: string;
  meta: Record<string, unknown> | null;
  created_by?: string | null;
  leads?: { company_name: string; lead_code?: string } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export const ACTIVITY_TYPES: { value: string; label: string; group: "Outreach" | "Replies" | "Other" }[] = [
  { value: "email_sent", label: "Email sent", group: "Outreach" },
  { value: "linkedin_sent", label: "LinkedIn message sent", group: "Outreach" },
  { value: "linkedin_connection_sent", label: "LinkedIn connection request sent", group: "Outreach" },
  { value: "instagram_sent", label: "Instagram message sent", group: "Outreach" },
  { value: "followup_sent", label: "Follow-up sent", group: "Outreach" },
  { value: "loom_sent", label: "Loom sent", group: "Outreach" },
  { value: "email_replied", label: "Email replied", group: "Replies" },
  { value: "linkedin_replied", label: "LinkedIn replied", group: "Replies" },
  { value: "instagram_replied", label: "Instagram replied", group: "Replies" },
  { value: "call", label: "Call", group: "Other" },
  { value: "meeting_booked", label: "Meeting booked", group: "Other" },
  { value: "client_closed", label: "Client closed", group: "Other" },
  { value: "note", label: "Note", group: "Other" },
];

const EVENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  created: CirclePlus,
  lead_created: CirclePlus,
  stage_changed: Flag,
  status_changed: Flag,
  priority_changed: Flag,
  email_sent: Mail,
  email_viewed: Mail,
  email_replied: Mail,
  loom_sent: CirclePlay,
  loom_watched: CirclePlay,
  linkedin_connection_sent: UserPlus,
  linkedin_sent: Linkedin,
  linkedin_replied: Linkedin,
  instagram_sent: Instagram,
  instagram_replied: MessageSquare,
  meeting_booked: Activity,
  client_closed: Activity,
  pushed_to_crm: Upload,
  research_export_email: Mail,
  archived: Archive,
  restored: ArchiveRestore,
  followup_sent: Link2,
  call: Phone,
  note: StickyNote,
};

export const EVENT_LABELS: Record<string, string> = {
  created: "Lead created",
  lead_created: "Lead created",
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
  research_export_email: "Lead profile emailed to me",
  archived: "Archived",
  restored: "Restored",
  followup_sent: "Follow-up sent",
  call: "Call",
  note: "Note added",
};

export function activityMeta(e: Pick<LeadEvent, "meta">): Record<string, any> {
  return e.meta && typeof e.meta === "object" ? (e.meta as Record<string, any>) : {};
}

export function defaultActivityLabel(e: Pick<LeadEvent, "event_type" | "meta">) {
  const m = activityMeta(e);
  if (e.event_type === "stage_changed" && m.from && m.to) return `Stage changed from ${m.from} to ${m.to}`;
  if (e.event_type === "status_changed" && m.from && m.to) return `Status changed from ${m.from} to ${m.to}`;
  if (e.event_type === "priority_changed" && m.from && m.to) return `Priority changed from ${m.from} to ${m.to}`;
  return EVENT_LABELS[e.event_type] ?? e.event_type.replace(/_/g, " ");
}

export function activityLabel(e: Pick<LeadEvent, "event_type" | "meta">) {
  const m = activityMeta(e);
  return typeof m.label === "string" && m.label.trim() ? m.label : defaultActivityLabel(e);
}

const FLAG_FIELDS: Record<string, { field: string; label: string }> = {
  email_sent: { field: "email_sent", label: "Email sent" },
  email_viewed: { field: "email_viewed", label: "Email viewed" },
  email_replied: { field: "email_replied", label: "Email replied" },
  loom_sent: { field: "loom_sent", label: "Loom sent" },
  loom_watched: { field: "loom_watched", label: "Loom watched" },
  linkedin_connection_sent: { field: "linkedin_connection_sent", label: "LinkedIn connection request sent" },
  linkedin_sent: { field: "linkedin_sent", label: "LinkedIn message sent" },
  linkedin_replied: { field: "linkedin_replied", label: "LinkedIn replied" },
  instagram_sent: { field: "instagram_sent", label: "Instagram sent" },
  instagram_replied: { field: "instagram_replied", label: "Instagram replied" },
  meeting_booked: { field: "meeting_booked", label: "Meeting booked" },
  client_closed: { field: "client_closed", label: "Client closed" },
};

export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function ActivityTypeSelect({
  value,
  onChange,
  current,
}: {
  value: string;
  onChange: (v: string) => void;
  current?: string;
}) {
  const known = ACTIVITY_TYPES.some((t) => t.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[210px] text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!known && current && (
          <SelectItem value={current}>{EVENT_LABELS[current] ?? current.replace(/_/g, " ")}</SelectItem>
        )}
        {ACTIVITY_TYPES.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.group === "Other" ? t.label : `${t.group}: ${t.label}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// TODO(server): live calls two server functions (update / delete a lead_events row with
// audit + ledger side effects). Ported here as direct Supabase writes until those exist.
async function updateLeadEvent(input: { id: string; label?: string; occurredAt?: string; eventType?: string }) {
  const { data: row } = await db.from("lead_events").select("meta").eq("id", input.id).maybeSingle();
  const meta = { ...(row?.meta ?? {}), edited: true } as Record<string, unknown>;
  if (input.label !== undefined) {
    if (input.label) meta.label = input.label;
    else delete meta.label;
  }
  const patch: Record<string, unknown> = { meta };
  if (input.occurredAt) patch.occurred_at = input.occurredAt;
  if (input.eventType) patch.event_type = input.eventType;
  const { error } = await db.from("lead_events").update(patch).eq("id", input.id);
  if (error) throw error;
}
async function deleteLeadEvent(input: { id: string }) {
  const { error } = await db.from("lead_events").delete().eq("id", input.id);
  if (error) throw error;
}

export type ActivityEdit = { label: string; occurredAt: string; eventType: string };
export type ActivityAdd = { leadId: string; type: string; label: string; occurredAt: string };

export function useActivityEdits(onDone?: () => void) {
  return {
    saveEdit: async (e: LeadEvent, edit: ActivityEdit) => {
      const label =
        edit.label.trim() === defaultActivityLabel({ event_type: edit.eventType, meta: e.meta }) ? "" : edit.label.trim();
      try {
        await updateLeadEvent({
          id: e.id,
          label,
          occurredAt: edit.occurredAt,
          ...(edit.eventType === e.event_type ? {} : { eventType: edit.eventType }),
        });
        toast.success("Activity updated");
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update this entry");
      }
    },
    remove: async (e: LeadEvent, patchLead?: (patch: Record<string, unknown>) => Promise<unknown>) => {
      if (
        !window.confirm(
          `Delete "${activityLabel(e)}"${e.leads?.company_name ? ` for ${e.leads.company_name}` : ""}? It also stops counting in the Ledger and Outreach Tracker.`,
        )
      )
        return;
      try {
        await deleteLeadEvent({ id: e.id });
        toast.success("Activity entry deleted");
        const flag = FLAG_FIELDS[e.event_type];
        if (flag && e.lead_id) {
          const { data } = await db.from("leads").select(flag.field).eq("id", e.lead_id).maybeSingle();
          if (data?.[flag.field] === true && window.confirm(`"${flag.label}" is still ticked on this lead. Untick it too?`)) {
            const patch = { [flag.field]: false, [`${flag.field}_at`]: null };
            if (patchLead) await patchLead(patch);
            else await db.from("leads").update(patch).eq("id", e.lead_id);
          }
        }
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete this entry");
      }
    },
    add: async (a: ActivityAdd) => {
      const flag = FLAG_FIELDS[a.type];
      if (flag) {
        const { data: lead } = await db
          .from("leads")
          .select(`stage_id, ${flag.field}`)
          .eq("id", a.leadId)
          .maybeSingle();
        const cur = (lead ?? {}) as Record<string, any>;
        if (lead && cur[flag.field] !== true) {
          const patch: Record<string, unknown> = { [flag.field]: true, [`${flag.field}_at`]: a.occurredAt };
          const { data: stages } = await db
            .from("stages")
            .select("id, name, order_index, board, is_won, is_lost, is_archived, is_reply_stage")
            .eq("board", "lead");
          const next = autoStageForOutreach(stages ?? [], cur.stage_id, patch);
          if (next) patch.stage_id = next.id;
          const { error } = await db.from("leads").update(patch).eq("id", a.leadId);
          if (error) return void toast.error(error.message);
          if (a.label.trim()) {
            const { data: ev } = await db
              .from("lead_events")
              .select("id, meta, event_type")
              .eq("lead_id", a.leadId)
              .eq("event_type", a.type)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (ev) await updateLeadEvent({ id: ev.id, label: a.label.trim() }).catch(() => undefined);
          }
          toast.success(`${flag.label} logged${next ? ` · stage moved to ${next.name}` : ""}`);
          onDone?.();
          return;
        }
      }
      const { data: auth } = await supabase.auth.getUser();
      const label = a.label.trim();
      const { error } = await db.from("lead_events").insert({
        lead_id: a.leadId,
        event_type: a.type,
        occurred_at: a.occurredAt,
        meta: { ...(label ? { label } : {}), manual: true },
        created_by: auth.user?.id ?? null,
      });
      if (error) return void toast.error(error.message);
      toast.success("Activity added");
      onDone?.();
    },
  };
}

/** Live opens the lead in a side "peek" panel (app-shell context); modifier clicks follow the href. */
export function LeadPeekLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  // TODO(app-shell): wire to the lead peek panel context (openLead) once the shell port exposes it.
  return (
    <a href={`/lt/leads/${id}`} onClick={(e) => e.stopPropagation()} className={cn("text-left", className)}>
      {children}
    </a>
  );
}

export function ActivityItem({
  e,
  canEdit,
  showLead = false,
  onEdit,
  onDelete,
}: {
  e: LeadEvent;
  canEdit: boolean;
  showLead?: boolean;
  onEdit: (edit: ActivityEdit) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(activityLabel(e));
  const [when, setWhen] = useState(toLocalInput(e.occurred_at));
  const [type, setType] = useState(e.event_type);
  const [saving, setSaving] = useState(false);
  const Icon = EVENT_ICONS[e.event_type] ?? Activity;
  const meta = activityMeta(e);

  if (editing)
    return (
      <div className="flex flex-col gap-1.5 border-l-2 border-foreground pl-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <ActivityTypeSelect
            value={type}
            current={e.event_type}
            onChange={(t) => {
              if (label === defaultActivityLabel({ event_type: type, meta: e.meta }))
                setLabel(defaultActivityLabel({ event_type: t, meta: e.meta }));
              setType(t);
            }}
          />
          <Input
            type="datetime-local"
            value={when}
            onChange={(ev) => setWhen(ev.target.value)}
            className="h-8 w-auto text-[12px]"
          />
        </div>
        <Input value={label} onChange={(ev) => setLabel(ev.target.value)} className="h-8 text-[13px]" autoFocus />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-8"
            disabled={saving || !when}
            onClick={async () => {
              setSaving(true);
              try {
                await onEdit({ label, occurredAt: new Date(when).toISOString(), eventType: type });
                setEditing(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Check className="size-3.5" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
            <X className="size-3.5" /> Cancel
          </Button>
        </div>
      </div>
    );

  return (
    <div className="group flex gap-2 border-l-2 border-border pl-3">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">
          {showLead && e.lead_id && (
            <>
              <LeadPeekLink id={e.lead_id} className="font-semibold hover:underline hover:underline-offset-4">
                {e.leads?.company_name ?? "Lead"}
              </LeadPeekLink>
              <span className="text-muted-foreground"> · </span>
            </>
          )}
          {activityLabel(e)}
        </div>
        <div className="label-text mt-0.5">
          {fmtDateTime(e.occurred_at)}
          {e.profiles?.full_name || e.profiles?.email ? ` · ${e.profiles.full_name ?? e.profiles.email}` : ""}
          {meta.edited ? " · edited" : ""}
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-start gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Edit this entry"
            onClick={() => {
              setLabel(activityLabel(e));
              setWhen(toLocalInput(e.occurred_at));
              setType(e.event_type);
              setEditing(true);
            }}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-subtle hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete this entry"
            onClick={onDelete}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-subtle hover:text-negative"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export type LeadPick = { id: string; company_name: string; lead_code: string };

export function LeadPicker({
  value,
  onChange,
  placeholder = "Find lead…",
  className,
}: {
  value: LeadPick | null;
  onChange: (v: LeadPick | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LeadPick[]>([]);
  useEffect(() => {
    if (value || q.trim().length < 2) return void setHits([]);
    const t = setTimeout(async () => {
      const term = q.trim().replace(/[%_,()]/g, " ");
      const { data } = await db
        .from("leads")
        .select("id, company_name, lead_code")
        .or(`company_name.ilike.%${term}%,lead_code.ilike.%${term}%,primary_contact.ilike.%${term}%`)
        .limit(8);
      setHits(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value)
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-[12px]">
        {value.company_name} <span className="text-muted-foreground">{value.lead_code}</span>
        <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      </span>
    );
  return (
    <div className={cn("relative", className)}>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full min-w-[200px] text-[12px]"
      />
      {hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-[260px] rounded-md border border-border bg-popover p-1 shadow-md">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                onChange(h);
                setQ("");
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] hover:bg-subtle"
            >
              <span className="truncate">{h.company_name}</span>
              <span className="text-muted-foreground">{h.lead_code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AddActivityForm({
  leadId,
  onAdd,
  onCancel,
}: {
  leadId?: string;
  onAdd: (a: ActivityAdd) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState("note");
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date().toISOString()));
  const [lead, setLead] = useState<LeadPick | null>(null);
  const [busy, setBusy] = useState(false);
  const target = leadId ?? lead?.id;
  const needsText = type === "note" || type === "call";
  const valid = !!target && (!needsText || !!label.trim());
  const submit = async () => {
    if (!valid || !target) return;
    setBusy(true);
    try {
      await onAdd({ leadId: target, type, label, occurredAt: new Date(when).toISOString() });
      setLabel("");
      setType("note");
      setWhen(toLocalInput(new Date().toISOString()));
      setLead(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {!leadId && <LeadPicker value={lead} onChange={setLead} />}
        <ActivityTypeSelect value={type} onChange={setType} />
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 w-auto text-[12px]" />
      </div>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={needsText ? "What happened? e.g. Called her, no answer" : "Details (optional)"}
        className="h-8 text-[13px]"
        autoFocus={!!leadId}
      />
      <div className="flex gap-1.5">
        <Button size="sm" className={cn("h-8")} disabled={!valid || busy} onClick={() => void submit()}>
          <Check className="size-3.5" /> Add
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
