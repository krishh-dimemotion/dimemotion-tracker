// Ported from live chunk lt.ledger-C7W2LCx6.js
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, EyeOff, SlidersHorizontal, Trash2 } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { Card, DatePicker, EmptyState, Loading, Metric, downloadCsv, fmtDateTime, todayISO } from "@/components/live/kit";
import { useOutreachChannelsConfig } from "@/lib/live/outreach-channels";
import { LeadLink } from "@/components/lt/events";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useChannels } from "@/hooks/useLookups";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/ledger")({
  head: () => ({ meta: [{ title: "Ledger | Lead Tracker" }] }),
  component: LedgerPage,
});

type ChannelKind = "email" | "instagram" | "linkedin";
type CardDef = { key: string; label: string; types: string[]; kind?: ChannelKind };

const CARDS: CardDef[] = [
  { key: "leads_added", label: "Leads added", types: [] },
  {
    key: "sent_all",
    label: "Outreach sent",
    types: ["email_sent", "instagram_sent", "linkedin_sent", "linkedin_connection_sent"],
  },
  { key: "email_sent", label: "Emails sent", types: ["email_sent"], kind: "email" },
  { key: "instagram_sent", label: "Instagram DMs sent", types: ["instagram_sent"], kind: "instagram" },
  { key: "linkedin_sent", label: "LinkedIn messages sent", types: ["linkedin_sent"], kind: "linkedin" },
  {
    key: "linkedin_connection_sent",
    label: "LinkedIn connections sent",
    types: ["linkedin_connection_sent"],
    kind: "linkedin",
  },
  { key: "replies_all", label: "Replies", types: ["email_replied", "instagram_replied", "linkedin_replied"] },
  { key: "email_replied", label: "Email replies", types: ["email_replied"], kind: "email" },
  { key: "instagram_replied", label: "Instagram replies", types: ["instagram_replied"], kind: "instagram" },
  { key: "linkedin_replied", label: "LinkedIn replies", types: ["linkedin_replied"], kind: "linkedin" },
  { key: "meeting_booked", label: "Meetings booked", types: ["meeting_booked"] },
  { key: "client_closed", label: "Clients closed", types: ["client_closed"] },
];

/** Cards hidden by default: per-channel replies, connections, and channels the workspace does not use. */
function defaultHidden(kinds: string[] | null) {
  const active = kinds && kinds.length ? kinds : ["email", "instagram", "linkedin"];
  return CARDS.filter((c) =>
    c.kind
      ? c.key.endsWith("_replied") || c.key === "linkedin_connection_sent"
        ? true
        : !active.includes(c.kind)
      : false,
  ).map((c) => c.key);
}

function readLocal<T>(key: string): T | null {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

type Delta = { text: string; tone?: "positive" | "negative" };
type Values = Record<string, { current: number; previous: number }>;

function LedgerCards({
  values,
  delta,
  channel = "all",
  toolbar,
}: {
  values: Values;
  delta: (c: number, p: number) => Delta;
  channel?: string;
  toolbar?: ReactNode;
}) {
  // TODO: live reads workspace from auth context; repo useAuth may not expose it.
  const auth = useAuth() as unknown as { workspace?: { id: string } | null };
  const { data: cfg } = useOutreachChannelsConfig();
  const storeKey = `tracker.ledger.${auth.workspace?.id ?? "none"}.hidden`;
  const [hidden, setHiddenState] = useState<Set<string>>(new Set(defaultHidden(null)));
  useEffect(() => {
    setHiddenState(new Set(readLocal<string[]>(storeKey) ?? defaultHidden(cfg?.kinds ?? null)));
  }, [storeKey, cfg]);
  const setHidden = (s: Set<string>) => {
    setHiddenState(s);
    writeLocal(storeKey, [...s]);
  };
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
  };
  const matchesChannel = (c: CardDef) =>
    channel === "all" ? true : c.kind ? c.kind === channel : c.key === "meeting_booked" || c.key === "client_closed";
  const visible = CARDS.filter((c) => !hidden.has(c.key) && matchesChannel(c));
  const hiddenCount = CARDS.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">{toolbar}</div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-medium shadow-xs hover:border-foreground/25"
            >
              <SlidersHorizontal className="size-3.5" />
              Customize
              {hiddenCount > 0 && (
                <span className="rounded-full bg-subtle px-1.5 font-mono text-[10.5px] text-muted-foreground">
                  {hiddenCount} hidden
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[280px] p-2">
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="section-label">Cards to show</span>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setHidden(new Set())}
                  className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="flex max-h-[360px] flex-col overflow-y-auto">
              {CARDS.map((c) => {
                const off = hidden.has(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggle(c.key)}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-subtle"
                  >
                    <span className={cn("min-w-0 truncate", off && "text-muted-foreground line-through")}>
                      {c.label}
                    </span>
                    {off ? (
                      <EyeOff className="size-3.5 shrink-0 text-faint" />
                    ) : (
                      <Eye className="size-3.5 shrink-0 text-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((c) => {
          const v = values[c.key] ?? { current: 0, previous: 0 };
          const d = delta(v.current, v.previous);
          return <Metric key={c.key} label={c.label} value={v.current} helper={d.text} tone={d.tone} />;
        })}
      </div>
    </div>
  );
}

const PAGE = 50;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EVENT_NAMES: Record<string, string> = {
  created: "Lead created",
  stage_changed: "Stage changed",
  status_changed: "Status changed",
  email_sent: "Email sent",
  email_viewed: "Email viewed",
  email_replied: "Email replied",
  loom_sent: "Loom sent",
  loom_watched: "Loom watched",
  linkedin_sent: "LinkedIn sent",
  linkedin_replied: "LinkedIn replied",
  instagram_sent: "Instagram sent",
  instagram_replied: "Instagram replied",
  meeting_booked: "Meeting booked",
  client_closed: "Client closed",
  pushed_to_crm: "Pushed to CRM",
  archived: "Archived",
  restored: "Restored",
  followup_sent: "Follow-up sent",
  note: "Note added",
};
const eventName = (t: string) => EVENT_NAMES[t] ?? t.replace(/_/g, " ");

type Period = "day" | "week" | "month" | "year";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string) => new Date(`${s}T12:00:00Z`);
const shortDay = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function weekOf(d: Date) {
  const start = addDays(d, -((d.getUTCDay() + 6) % 7));
  return { start, end: addDays(start, 6) };
}
function monthOf(d: Date) {
  return {
    start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
    end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
  };
}
function yearOf(d: Date) {
  return { start: new Date(Date.UTC(d.getUTCFullYear(), 0, 1)), end: new Date(Date.UTC(d.getUTCFullYear(), 11, 31)) };
}
function rangeOf(p: Period, d: Date) {
  return p === "day" ? { start: d, end: d } : p === "week" ? weekOf(d) : p === "month" ? monthOf(d) : yearOf(d);
}
function periodTitle(p: Period, d: Date) {
  const { start, end } = rangeOf(p, d);
  if (p === "day") return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (p === "week") return `Week of ${shortDay(start)} - ${shortDay(end)}, ${end.getUTCFullYear()}`;
  if (p === "month") return `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  return `${start.getUTCFullYear()}`;
}
function shift(p: Period, d: Date, n: number) {
  if (p === "day") return addDays(d, n);
  if (p === "week") return addDays(d, n * 7);
  if (p === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  return new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), 1));
}
function metaDetails(meta: unknown, channels: Map<string, string>) {
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m.channel_id === "string" && channels.get(m.channel_id)) parts.push(channels.get(m.channel_id)!);
  if (typeof m.channel === "string") parts.push(m.channel);
  if (typeof m.subject === "string") parts.push(m.subject);
  const from = typeof m.from === "string" ? m.from : typeof m.from_stage === "string" ? m.from_stage : null;
  const to = typeof m.to === "string" ? m.to : typeof m.to_stage === "string" ? m.to_stage : null;
  if (from && to) parts.push(`${from} to ${to}`);
  if (typeof m.note === "string") parts.push(m.note);
  return parts.join(" · ");
}

const EVENT_FILTERS: Record<string, string[] | undefined> = {
  all: undefined,
  sent: ["email_sent", "instagram_sent", "linkedin_sent", "linkedin_connection_sent", "loom_sent", "followup_sent"],
  replies: ["email_replied", "instagram_replied", "linkedin_replied"],
  meetings: ["meeting_booked"],
  closed: ["client_closed"],
  created: ["lead_created"],
  stages: ["stage_changed"],
};

function delta(current: number, previous: number): Delta {
  const diff = current - previous;
  const pctText =
    previous > 0 ? `${diff >= 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%` : current > 0 ? "new" : "0%";
  return {
    text: `${diff > 0 ? "+" : ""}${diff} (${pctText}) vs prev`,
    tone: diff > 0 ? "positive" : diff < 0 ? "negative" : undefined,
  };
}

type EvLite = { id?: string; event_type: string; occurred_at: string; lead_id: string | null };

/** Counts unique lead + type + local day, so double-logged entries count once. */
function countUnique(rows: EvLite[] | undefined, types: string[]) {
  const s = new Set<string>();
  for (const r of rows ?? []) {
    if (!types.includes(r.event_type)) continue;
    const day = new Date(r.occurred_at).toLocaleDateString("en-CA");
    s.add(`${r.lead_id ?? r.id}|${r.event_type}|${day}`);
  }
  return s.size;
}
const dayBound = (d: string, end = false) => new Date(`${d}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString();

function usePeriod(period: Period, anchorStr: string) {
  return useMemo(() => {
    const anchor = parseDay(anchorStr);
    const { start, end } = rangeOf(period, anchor);
    const prev = rangeOf(period, shift(period, anchor, -1));
    return { anchor, start: iso(start), end: iso(end), prevStart: iso(prev.start), prevEnd: iso(prev.end) };
  }, [period, anchorStr]);
}

type LedgerEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  meta: { label?: string } & Record<string, unknown>;
  lead_id: string | null;
  leads: { company_name: string | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

// TODO: live calls a server function (deleteLeadEvent, app-shell `m`) with auth middleware.
async function deleteLeadEventFn({ data }: { data: { id: string } }) {
  const { error } = await supabase.from("lead_events").delete().eq("id", data.id);
  if (error) throw error;
}

function LedgerPage() {
  const [period, setPeriodState] = useState<Period>("day");
  const [anchorStr, setAnchor] = useState(todayISO());
  const [limit, setLimit] = useState(PAGE);
  const [eventFilter, setEventFilter] = useState("all");
  const [channel, setChannel] = useState("all");
  const { anchor, start, end, prevStart, prevEnd } = usePeriod(period, anchorStr);
  const { data: channels } = useChannels();
  const channelMap = useMemo(() => new Map((channels ?? []).map((c) => [c.id, c.name])), [channels]);

  const setPeriod = (p: Period) => {
    setPeriodState(p);
    setLimit(PAGE);
  };
  const step = (n: number) => {
    setAnchor(iso(shift(period, anchor, n)));
    setLimit(PAGE);
  };
  const goToday = () => {
    setAnchor(todayISO());
    setLimit(PAGE);
  };

  const eventsQ = useQuery({
    queryKey: ["ledger-events", start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("id, event_type, occurred_at, meta, lead_id, leads(company_name), profiles(full_name, email)")
        .gte("occurred_at", dayBound(start))
        .lte("occurred_at", dayBound(end, true))
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LedgerEvent[];
    },
  });
  const prevQ = useQuery({
    queryKey: ["ledger-events-prev", prevStart, prevEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("event_type, occurred_at, lead_id")
        .gte("occurred_at", dayBound(prevStart))
        .lte("occurred_at", dayBound(prevEnd, true));
      if (error) throw error;
      return (data ?? []) as EvLite[];
    },
  });
  const addedQ = useQuery({
    queryKey: ["ledger-leads-added", start, end],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("date_added", start)
        .lte("date_added", end);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const addedPrevQ = useQuery({
    queryKey: ["ledger-leads-added-prev", prevStart, prevEnd],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("date_added", prevStart)
        .lte("date_added", prevEnd);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { can, isAdmin } = useAuth();
  const canEdit = isAdmin || can("lead.lead_edit");
  const qc = useQueryClient();
  const removeEntry = async (e: LedgerEvent) => {
    const label = e.meta?.label || eventName(e.event_type);
    if (
      !window.confirm(
        `Delete "${label}"${e.leads?.company_name ? ` for ${e.leads.company_name}` : ""}? It stops counting in the Ledger and Outreach Tracker.`,
      )
    )
      return;
    try {
      await deleteLeadEventFn({ data: { id: e.id } });
      toast.success("Entry deleted");
      void qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete this entry");
    }
  };

  const loading = eventsQ.isLoading || addedQ.isLoading;
  const events = eventsQ.data ?? [];
  const prev = prevQ.data;
  const values: Values = {};
  for (const c of CARDS) {
    values[c.key] =
      c.key === "leads_added"
        ? { current: addedQ.data ?? 0, previous: addedPrevQ.data ?? 0 }
        : { current: countUnique(events, c.types), previous: countUnique(prev, c.types) };
  }

  const filtered = events.filter((e) => {
    const types = EVENT_FILTERS[eventFilter];
    return !((types && !types.includes(e.event_type)) || (channel !== "all" && !e.event_type.startsWith(channel)));
  });

  const weekOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const base = weekOf(parseDay(todayISO())).start;
    for (let i = 0; i < 26; i++) {
      const d = addDays(base, -7 * i);
      out.push({ value: iso(d), label: `Week of ${shortDay(d)}` });
    }
    return out;
  }, []);
  const monthOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      out.push({ value: iso(d), label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
    }
    return out;
  }, []);
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    const out: { value: string; label: string }[] = [];
    for (let i = y; i >= y - 6; i--) out.push({ value: iso(new Date(Date.UTC(i, 0, 1))), label: String(i) });
    return out;
  }, []);
  const weekValue = iso(weekOf(anchor).start);
  const monthValue = iso(monthOf(anchor).start);
  const yearValue = iso(yearOf(anchor).start);
  const shown = filtered.slice(0, limit);

  const pick = (v: string) => {
    setAnchor(v);
    setLimit(PAGE);
  };

  return (
    // live: guide="ledger" (repo AppPage has no guide prop)
    <AppPage
      module="lead"
      title="Ledger"
      perm="lead.ledger"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            downloadCsv(`ledger-${period}-${start}.csv`, [
              ["Date", "Lead", "Event", "Details", "User"],
              ...filtered.map((e) => [
                fmtDateTime(e.occurred_at),
                e.leads?.company_name ?? "",
                eventName(e.event_type),
                metaDetails(e.meta, channelMap),
                e.profiles?.full_name ?? e.profiles?.email ?? "",
              ]),
            ]);
          }}
        >
          Export CSV
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-border/80 p-0.5">
              {(["day", "week", "month", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded px-3 py-1 text-[13px] capitalize",
                    period === p ? "bg-subtle font-medium" : "text-muted-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button size="icon" variant="outline" className="size-8" onClick={() => step(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            {period === "day" && (
              <DatePicker
                value={anchorStr}
                onChange={(v?: string) => {
                  setAnchor(v || todayISO());
                  setLimit(PAGE);
                }}
                className="w-[150px] text-[13px]"
              />
            )}
            {period === "week" && (
              <Select value={weekValue} onValueChange={pick}>
                <SelectTrigger className="h-8 w-[190px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {period === "month" && (
              <Select value={monthValue} onValueChange={pick}>
                <SelectTrigger className="h-8 w-[150px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {period === "year" && (
              <Select value={yearValue} onValueChange={pick}>
                <SelectTrigger className="h-8 w-[110px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="icon" variant="outline" className="size-8" onClick={() => step(1)}>
              <ChevronRight className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={goToday}>
              Today
            </Button>
            <div className="ml-auto text-[13px] text-muted-foreground">{periodTitle(period, anchor)}</div>
          </div>
        </Card>

        <LedgerCards
          values={values}
          delta={delta}
          channel={channel}
          toolbar={
            <div className="flex max-w-full flex-wrap gap-0.5 rounded-[10px] border border-border bg-subtle p-[3px]">
              {(
                [
                  ["all", "All channels"],
                  ["email", "Email"],
                  ["instagram", "Instagram"],
                  ["linkedin", "LinkedIn"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setChannel(k);
                    setLimit(PAGE);
                  }}
                  className={cn(
                    "pressable rounded-[7px] px-3 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors",
                    channel === k
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={eventFilter}
            onValueChange={(v) => {
              setEventFilter(v);
              setLimit(PAGE);
            }}
          >
            <SelectTrigger className="h-8 w-48 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="sent">Outreach sent</SelectItem>
              <SelectItem value="replies">Replies</SelectItem>
              <SelectItem value="meetings">Meetings booked</SelectItem>
              <SelectItem value="closed">Clients closed</SelectItem>
              <SelectItem value="created">Leads added</SelectItem>
              <SelectItem value="stages">Stage changes</SelectItem>
            </SelectContent>
          </Select>
          {(eventFilter !== "all" || channel !== "all") && (
            <span className="text-[12.5px] text-muted-foreground">
              {filtered.length} of {events.length} events
            </span>
          )}
        </div>

        <Card className="overflow-hidden p-0">
          {loading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No activity"
              hint={events.length ? "No events match these filters." : "No lead events found for this period."}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      {["Date", "Lead", "Event", "Details", "User", ...(canEdit ? [""] : [])].map((h) => (
                        <th
                          key={h}
                          className="h-9 whitespace-nowrap px-3 text-left font-medium text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e) => (
                      <tr key={e.id} className="h-9 border-b border-border last:border-0 hover:bg-subtle">
                        <td className="whitespace-nowrap px-3 text-muted-foreground">{fmtDateTime(e.occurred_at)}</td>
                        <td className="px-3">
                          {e.lead_id ? (
                            <LeadLink id={e.lead_id} className="font-medium hover:underline hover:underline-offset-4">
                              {e.leads?.company_name ?? "View lead"}
                            </LeadLink>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3">{e.meta?.label || eventName(e.event_type)}</td>
                        <td className="px-3 text-muted-foreground">{metaDetails(e.meta, channelMap)}</td>
                        <td className="whitespace-nowrap px-3 text-muted-foreground">
                          {e.profiles?.full_name ?? e.profiles?.email ?? ""}
                        </td>
                        {canEdit && (
                          <td className="w-8 px-1 text-right">
                            <button
                              type="button"
                              title="Delete this entry"
                              onClick={() => void removeEntry(e)}
                              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-card hover:text-negative"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {limit < filtered.length && (
                <div className="flex justify-center border-t border-border p-3">
                  <Button size="sm" variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                    Load more ({filtered.length - limit} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </AppPage>
  );
}
