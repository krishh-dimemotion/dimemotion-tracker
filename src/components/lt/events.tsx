// Ported from the live app-shell chunk (event pieces: Da, Oa, ka, Aa, ja, Ma, Na, Pa, Fa, Ia, La, Ra, za, Ya).
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  Archive,
  ArchiveRestore,
  Check,
  CirclePlay,
  CirclePlus,
  Flag,
  Instagram,
  Linkedin,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Send,
  StickyNote,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { autoStageForOutreach } from "@/lib/live/config";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LeadEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  meta: unknown;
  lead_id: string | null;
  leads?: { company_name: string | null; lead_code: string | null } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export const EVENT_TYPES: { value: string; label: string; group: "Outreach" | "Replies" | "Other" }[] = [
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

type Icon = ComponentType<{ className?: string }>;

export const EVENT_ICONS: Record<string, Icon> = {
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
  followup_sent: Send, // live symbol "We", icon not confirmed
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

export function eventMeta(e: { meta: unknown }): Record<string, unknown> {
  return e.meta && typeof e.meta === "object" ? (e.meta as Record<string, unknown>) : {};
}

export function eventDefaultLabel(e: { event_type: string; meta: unknown }) {
  const m = eventMeta(e);
  if (e.event_type === "stage_changed" && m.from && m.to) return `Stage changed from ${m.from} to ${m.to}`;
  if (e.event_type === "status_changed" && m.from && m.to) return `Status changed from ${m.from} to ${m.to}`;
  if (e.event_type === "priority_changed" && m.from && m.to) return `Priority changed from ${m.from} to ${m.to}`;
  return EVENT_LABELS[e.event_type] ?? e.event_type.replace(/_/g, " ");
}

export function eventLabel(e: { event_type: string; meta: unknown }) {
  const m = eventMeta(e);
  return typeof m.label === "string" && m.label.trim() ? m.label : eventDefaultLabel(e);
}

/** Event types that mirror a boolean flag column on `leads`. */
export const EVENT_FLAG_FIELDS: Record<string, { field: string; label: string }> = {
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

export function EventTypeSelect({
  value,
  onChange,
  current,
}: {
  value: string;
  onChange: (v: string) => void;
  current?: string;
}) {
  const known = EVENT_TYPES.some((t) => t.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[210px] text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!known && current && (
          <SelectItem value={current}>{EVENT_LABELS[current] ?? current.replace(/_/g, " ")}</SelectItem>
        )}
        {EVENT_TYPES.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.group === "Other" ? t.label : `${t.group}: ${t.label}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// TODO: live calls server functions (updateLeadEvent / deleteLeadEvent, createServerFn POST with auth
// middleware). Stubbed here with direct Supabase writes.
async function updateLeadEventFn(data: { id: string; label?: string; occurredAt?: string; eventType?: string }) {
  const { data: row } = await supabase.from("lead_events").select("meta").eq("id", data.id).maybeSingle();
  const meta = { ...((row?.meta as Record<string, unknown>) ?? {}), edited: true } as Record<string, unknown>;
  if (data.label !== undefined) {
    if (data.label) meta.label = data.label;
    else delete meta.label;
  }
  const patch: Record<string, unknown> = { meta };
  if (data.occurredAt) patch.occurred_at = data.occurredAt;
  if (data.eventType) patch.event_type = data.eventType;
  const { error } = await supabase.from("lead_events").update(patch as never).eq("id", data.id);
  if (error) throw error;
}
async function deleteLeadEventFn(data: { id: string }) {
  const { error } = await supabase.from("lead_events").delete().eq("id", data.id);
  if (error) throw error;
}


export type EventEdit = { label: string; occurredAt: string; eventType: string };
export type EventAdd = { leadId: string; type: string; label: string; occurredAt: string };

export function useEventActions(onDone?: () => void) {
  return {
    saveEdit: async (e: LeadEvent, edit: EventEdit) => {
      const label =
        edit.label.trim() === eventDefaultLabel({ event_type: edit.eventType, meta: e.meta }) ? "" : edit.label.trim();
      try {
        await updateLeadEventFn({
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
    remove: async (e: LeadEvent, untick?: (patch: Record<string, unknown>) => Promise<void>) => {
      if (
        !window.confirm(
          `Delete "${eventLabel(e)}"${e.leads?.company_name ? ` for ${e.leads.company_name}` : ""}? It also stops counting in the Ledger and Outreach Tracker.`,
        )
      )
        return;
      try {
        await deleteLeadEventFn({ id: e.id });
        toast.success("Activity entry deleted");
        const flag = EVENT_FLAG_FIELDS[e.event_type];
        if (flag && e.lead_id) {
          const { data } = await supabase.from("leads").select(flag.field).eq("id", e.lead_id).maybeSingle();
          if (
            (data as Record<string, unknown> | null)?.[flag.field] === true &&
            window.confirm(`"${flag.label}" is still ticked on this lead. Untick it too?`)
          ) {
            const patch = { [flag.field]: false, [`${flag.field}_at`]: null };
            if (untick) await untick(patch);
            else await supabase.from("leads").update(patch as never).eq("id", e.lead_id);
          }
        }
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete this entry");
      }
    },
    add: async (a: EventAdd) => {
      const flag = EVENT_FLAG_FIELDS[a.type];
      if (flag) {
        const { data: lead } = await supabase
          .from("leads")
          .select(`stage_id, ${flag.field}`)
          .eq("id", a.leadId)
          .maybeSingle();
        const row = (lead ?? {}) as Record<string, unknown>;
        if (lead && row[flag.field] !== true) {
          const patch: Record<string, unknown> = { [flag.field]: true, [`${flag.field}_at`]: a.occurredAt };
          const { data: stages } = await supabase
            .from("stages")
            .select("id, name, order_index, board, is_won, is_lost, is_archived, is_reply_stage")
            .eq("board", "lead");
          const next = autoStageForOutreach(stages ?? [], (row.stage_id as string) ?? null, patch);
          if (next) patch.stage_id = next.id;
          const { error } = await supabase.from("leads").update(patch as never).eq("id", a.leadId);
          if (error) {
            toast.error(error.message);
            return;
          }
          if (a.label.trim()) {
            const { data: ev } = await supabase
              .from("lead_events")
              .select("id, meta, event_type")
              .eq("lead_id", a.leadId)
              .eq("event_type", a.type)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (ev) await updateLeadEventFn({ id: ev.id, label: a.label.trim() }).catch(() => undefined);
          }
          toast.success(`${flag.label} logged${next ? ` · stage moved to ${next.name}` : ""}`);
          onDone?.();
          return;
        }
      }
      const { data: u } = await supabase.auth.getUser();
      const label = a.label.trim();
      const { error } = await supabase.from("lead_events").insert({
        lead_id: a.leadId,
        event_type: a.type,
        occurred_at: a.occurredAt,
        meta: { ...(label ? { label } : {}), manual: true },
        created_by: u.user?.id ?? null,
      } as never);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Activity added");
      onDone?.();
    },
  };
}

/** Live app-shell `Ua`: lead peek panel context. TODO: live renders a resizable right Sheet with the lead
 * detail (LeadPeekProvider `Ja`); this fallback navigates to the lead page instead. */
export function useLeadPeek() {
  return {
    openLead: (id: string) => {
      window.location.href = `/lt/leads/${id}`;
    },
  };
}

/** Opens the lead peek panel in live. TODO: live uses a LeadPeek context provider; this falls back to a plain link. */
export function LeadLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <a href={`/lt/leads/${id}`} onClick={(e) => e.stopPropagation()} className={cn("text-left", className)}>
      {children}
    </a>
  );
}

export function EventRow({
  e,
  canEdit,
  showLead = false,
  onEdit,
  onDelete,
}: {
  e: LeadEvent;
  canEdit: boolean;
  showLead?: boolean;
  onEdit: (edit: EventEdit) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(eventLabel(e));
  const [when, setWhen] = useState(toLocalInput(e.occurred_at));
  const [type, setType] = useState(e.event_type);
  const [saving, setSaving] = useState(false);
  const IconC = EVENT_ICONS[e.event_type] ?? Activity;
  const meta = eventMeta(e);

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 border-l-2 border-foreground pl-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <EventTypeSelect
            value={type}
            current={e.event_type}
            onChange={(t) => {
              if (label === eventDefaultLabel({ event_type: type, meta: e.meta }))
                setLabel(eventDefaultLabel({ event_type: t, meta: e.meta }));
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
  }

  return (
    <div className="group flex gap-2 border-l-2 border-border pl-3">
      <IconC className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">
          {showLead && e.lead_id && (
            <>
              <LeadLink id={e.lead_id} className="font-semibold hover:underline hover:underline-offset-4">
                {e.leads?.company_name ?? "Lead"}
              </LeadLink>
              <span className="text-muted-foreground"> · </span>
            </>
          )}
          {eventLabel(e)}
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
              setLabel(eventLabel(e));
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

export type PickedLead = { id: string; company_name: string; lead_code: string };

export function LeadPicker({
  value,
  onChange,
  placeholder = "Find lead…",
  className,
}: {
  value: PickedLead | null;
  onChange: (v: PickedLead | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedLead[]>([]);
  useEffect(() => {
    if (value || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const term = q.trim().replace(/[%_,()]/g, " ");
      const { data } = await supabase
        .from("leads")
        .select("id, company_name, lead_code")
        .or(`company_name.ilike.%${term}%,lead_code.ilike.%${term}%,primary_contact.ilike.%${term}%`)
        .limit(8);
      setResults((data ?? []) as PickedLead[]);
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-[12px]">
        {value.company_name} <span className="text-muted-foreground">{value.lead_code}</span>
        <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      </span>
    );
  }
  return (
    <div className={cn("relative", className)}>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full min-w-[200px] text-[12px]"
      />
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-[260px] rounded-md border border-border bg-popover p-1 shadow-md">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onChange(r);
                setQ("");
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] hover:bg-subtle"
            >
              <span className="truncate">{r.company_name}</span>
              <span className="text-muted-foreground">{r.lead_code}</span>
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
  onAdd: (a: EventAdd) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState("note");
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date().toISOString()));
  const [picked, setPicked] = useState<PickedLead | null>(null);
  const [busy, setBusy] = useState(false);
  const target = leadId ?? picked?.id;
  const needsText = type === "note" || type === "call";
  const ok = !!target && (!needsText || !!label.trim());

  const submit = async () => {
    if (!ok || !target) return;
    setBusy(true);
    try {
      await onAdd({ leadId: target, type, label, occurredAt: new Date(when).toISOString() });
      setLabel("");
      setType("note");
      setWhen(toLocalInput(new Date().toISOString()));
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {!leadId && <LeadPicker value={picked} onChange={setPicked} />}
        <EventTypeSelect value={type} onChange={setType} />
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-8 w-auto text-[12px]"
        />
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
        <Button size="sm" className="h-8" disabled={!ok || busy} onClick={() => void submit()}>
          <Check className="size-3.5" /> Add
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

