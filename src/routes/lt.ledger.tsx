import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading, Metric } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useChannels } from "@/hooks/useLookups";
import { downloadCsv, fmtDateTime, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/ledger")({
  head: () => ({
    meta: [
      { title: "Ledger | Lead Tracker" },
      { name: "description", content: "Outreach and conversion ledger by day, week, month or year." },
      { property: "og:title", content: "Ledger | Lead Tracker" },
      { property: "og:description", content: "Outreach and conversion ledger by day, week, month or year." },
    ],
  }),
  component: LedgerPage,
});

type Period = "day" | "week" | "month" | "year";

const PAGE_SIZE = 50;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const EVENT_LABELS: Record<string, string> = {
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

function eventLabel(type: string) {
  return EVENT_LABELS[type] ?? type.replace(/_/g, " ");
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISO(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function fmtShort(d: Date) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function addDaysUTC(d: Date, days: number) {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function weekRange(d: Date) {
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  const start = addDaysUTC(d, -dow);
  const end = addDaysUTC(start, 6);
  return { start, end };
}

function monthRange(d: Date) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start, end };
}

function yearRange(d: Date) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
  return { start, end };
}

function rangeFor(period: Period, anchor: Date) {
  if (period === "day") return { start: anchor, end: anchor };
  if (period === "week") return weekRange(anchor);
  if (period === "month") return monthRange(anchor);
  return yearRange(anchor);
}

function periodLabel(period: Period, anchor: Date) {
  const { start, end } = rangeFor(period, anchor);
  if (period === "day") return anchor.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (period === "week") return `Week of ${fmtShort(start)} - ${fmtShort(end)}, ${end.getUTCFullYear()}`;
  if (period === "month") return `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  return `${start.getUTCFullYear()}`;
}

function shiftAnchor(period: Period, anchor: Date, dir: 1 | -1) {
  if (period === "day") return addDaysUTC(anchor, dir);
  if (period === "week") return addDaysUTC(anchor, dir * 7);
  if (period === "month") return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + dir, 1));
  return new Date(Date.UTC(anchor.getUTCFullYear() + dir, anchor.getUTCMonth(), 1));
}

function metaSummary(meta: unknown, channelMap: Map<string, string>): string {
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m["channel_id"] === "string" && channelMap.get(m["channel_id"] as string)) parts.push(channelMap.get(m["channel_id"] as string)!);
  if (typeof m["channel"] === "string") parts.push(m["channel"] as string);
  if (typeof m["subject"] === "string") parts.push(m["subject"] as string);
  const fromName = typeof m["from"] === "string" ? m["from"] : typeof m["from_stage"] === "string" ? m["from_stage"] : null;
  const toName = typeof m["to"] === "string" ? m["to"] : typeof m["to_stage"] === "string" ? m["to_stage"] : null;
  if (fromName && toName) parts.push(`${fromName} to ${toName}`);
  if (typeof m["note"] === "string") parts.push(m["note"] as string);
  return parts.join(" \u00b7 ");
}

type EventRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  meta: unknown;
  lead_id: string | null;
  leads: { company_name: string | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

function delta(current: number, previous: number): { text: string; tone?: "positive" | "negative" } {
  const diff = current - previous;
  const pctText = previous > 0 ? `${diff >= 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%` : current > 0 ? "new" : "0%";
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${diff} (${pctText}) vs prev`,
    tone: diff > 0 ? "positive" : diff < 0 ? "negative" : undefined,
  };
}

function countTypes(events: EventRow[] | undefined, types: string[]) {
  return (events ?? []).filter((e) => types.includes(e.event_type)).length;
}

function useLedgerRange(period: Period, anchorISO: string) {
  return useMemo(() => {
    const anchor = parseISO(anchorISO);
    const { start, end } = rangeFor(period, anchor);
    const prevAnchor = shiftAnchor(period, anchor, -1);
    const prevRange = period === "day" ? rangeFor(period, prevAnchor) : rangeFor(period, prevAnchor);
    return { anchor, start: toISO(start), end: toISO(end), prevStart: toISO(prevRange.start), prevEnd: toISO(prevRange.end) };
  }, [period, anchorISO]);
}

function LedgerPage() {
  const [period, setPeriod] = useState<Period>("day");
  const [anchorISO, setAnchorISO] = useState<string>(todayISO());
  const [visible, setVisible] = useState(PAGE_SIZE);

  const { anchor, start, end, prevStart, prevEnd } = useLedgerRange(period, anchorISO);
  const { data: channels } = useChannels();
  const channelMap = useMemo(() => new Map((channels ?? []).map((c: any) => [c.id, c.name])), [channels]);

  const setPeriodAndReset = (p: Period) => {
    setPeriod(p);
    setVisible(PAGE_SIZE);
  };
  const nav = (dir: 1 | -1) => {
    setAnchorISO(toISO(shiftAnchor(period, anchor, dir)));
    setVisible(PAGE_SIZE);
  };
  const goToday = () => {
    setAnchorISO(todayISO());
    setVisible(PAGE_SIZE);
  };

  const eventsQuery = useQuery({
    queryKey: ["ledger-events", start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("id, event_type, occurred_at, meta, lead_id, leads(company_name), profiles(full_name, email)")
        .gte("occurred_at", `${start}T00:00:00`)
        .lte("occurred_at", `${end}T23:59:59`)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });

  const prevEventsQuery = useQuery({
    queryKey: ["ledger-events-prev", prevStart, prevEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("event_type, occurred_at")
        .gte("occurred_at", `${prevStart}T00:00:00`)
        .lte("occurred_at", `${prevEnd}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });

  const leadsAddedQuery = useQuery({
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

  const prevLeadsAddedQuery = useQuery({
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

  const isLoading = eventsQuery.isLoading || leadsAddedQuery.isLoading;
  const events = eventsQuery.data ?? [];
  const prevEvents = prevEventsQuery.data;

  const metrics = [
    { label: "Leads added", current: leadsAddedQuery.data ?? 0, previous: prevLeadsAddedQuery.data ?? 0 },
    { label: "Emails sent", current: countTypes(events, ["email_sent"]), previous: countTypes(prevEvents, ["email_sent"]) },
    { label: "Replies", current: countTypes(events, ["email_replied", "linkedin_replied", "instagram_replied"]), previous: countTypes(prevEvents, ["email_replied", "linkedin_replied", "instagram_replied"]) },
    { label: "Meetings booked", current: countTypes(events, ["meeting_booked"]), previous: countTypes(prevEvents, ["meeting_booked"]) },
    { label: "Clients closed", current: countTypes(events, ["client_closed"]), previous: countTypes(prevEvents, ["client_closed"]) },
  ];

  const weekOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const cur = weekRange(parseISO(todayISO())).start;
    for (let i = 0; i < 26; i++) {
      const monday = addDaysUTC(cur, -7 * i);
      opts.push({ value: toISO(monday), label: `Week of ${fmtShort(monday)}` });
    }
    return opts;
  }, []);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const m = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      opts.push({ value: toISO(m), label: `${MONTHS[m.getUTCMonth()]} ${m.getUTCFullYear()}` });
    }
    return opts;
  }, []);

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    const arr: { value: string; label: string }[] = [];
    for (let y = cur; y >= cur - 6; y--) arr.push({ value: toISO(new Date(Date.UTC(y, 0, 1))), label: String(y) });
    return arr;
  }, []);

  const selectedWeekValue = toISO(weekRange(anchor).start);
  const selectedMonthValue = toISO(monthRange(anchor).start);
  const selectedYearValue = toISO(yearRange(anchor).start);

  const visibleEvents = events.slice(0, visible);

  const exportCsv = () => {
    const header = ["Date", "Lead", "Event", "Details", "User"];
    const toRow = (e: EventRow) => [
      fmtDateTime(e.occurred_at),
      e.leads?.company_name ?? "",
      eventLabel(e.event_type),
      metaSummary(e.meta, channelMap),
      e.profiles?.full_name ?? e.profiles?.email ?? "",
    ];
    downloadCsv(`ledger-${period}-${start}.csv`, [header, ...events.map(toRow)]);
  };

  return (
    <AppPage
      module="lead"
      title="Ledger"
      perm="lead.ledger"
      actions={<Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>}
    >
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-md border border-border p-0.5">
              {(["day", "week", "month", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodAndReset(p)}
                  className={cn(
                    "rounded px-3 py-1 text-[13px] capitalize",
                    period === p ? "bg-subtle font-medium" : "text-muted-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            <Button size="icon" variant="outline" className="size-8" onClick={() => nav(-1)}>
              <ChevronLeft className="size-4" />
            </Button>

            {period === "day" && (
              <Input
                type="date"
                value={anchorISO}
                onChange={(e) => {
                  setAnchorISO(e.target.value || todayISO());
                  setVisible(PAGE_SIZE);
                }}
                className="h-8 w-[150px] text-[13px]"
              />
            )}
            {period === "week" && (
              <Select value={selectedWeekValue} onValueChange={(v) => { setAnchorISO(v); setVisible(PAGE_SIZE); }}>
                <SelectTrigger className="h-8 w-[190px] text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {weekOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {period === "month" && (
              <Select value={selectedMonthValue} onValueChange={(v) => { setAnchorISO(v); setVisible(PAGE_SIZE); }}>
                <SelectTrigger className="h-8 w-[150px] text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {period === "year" && (
              <Select value={selectedYearValue} onValueChange={(v) => { setAnchorISO(v); setVisible(PAGE_SIZE); }}>
                <SelectTrigger className="h-8 w-[110px] text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Button size="icon" variant="outline" className="size-8" onClick={() => nav(1)}>
              <ChevronRight className="size-4" />
            </Button>

            <Button size="sm" variant="outline" onClick={goToday}>Today</Button>

            <div className="ml-auto text-[13px] text-muted-foreground">{periodLabel(period, anchor)}</div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => {
            const d = delta(m.current, m.previous);
            return <Metric key={m.label} label={m.label} value={m.current} helper={d.text} tone={d.tone} />;
          })}
        </div>

        <Card className="overflow-hidden p-0">
          {isLoading ? (
            <Loading />
          ) : events.length === 0 ? (
            <EmptyState title="No activity" hint="No lead events found for this period." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      {["Date", "Lead", "Event", "Details", "User"].map((h) => (
                        <th key={h} className="h-9 whitespace-nowrap px-3 text-left font-medium text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEvents.map((e) => (
                      <tr key={e.id} className="h-9 border-b border-border last:border-0 hover:bg-subtle">
                        <td className="whitespace-nowrap px-3 text-muted-foreground">{fmtDateTime(e.occurred_at)}</td>
                        <td className="px-3">
                          {e.lead_id ? (
                            <Link to="/lt/leads/$id" params={{ id: e.lead_id }} className="text-primary hover:underline">
                              {e.leads?.company_name ?? "View lead"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3">{eventLabel(e.event_type)}</td>
                        <td className="px-3 text-muted-foreground">{metaSummary(e.meta, channelMap)}</td>
                        <td className="whitespace-nowrap px-3 text-muted-foreground">{e.profiles?.full_name ?? e.profiles?.email ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible < events.length && (
                <div className="flex justify-center border-t border-border p-3">
                  <Button size="sm" variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                    Load more ({events.length - visible} remaining)
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
