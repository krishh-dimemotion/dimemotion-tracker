import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, pct, todayISO } from "@/lib/format";
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year: date.getUTCFullYear(), week };
}

function isoWeekRange(year: number, week: number): { start: Date; end: Date } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = (jan4.getUTCDay() + 6) % 7;
  const monday1 = new Date(jan4);
  monday1.setUTCDate(jan4.getUTCDate() - dayNum);
  const start = new Date(monday1);
  start.setUTCDate(monday1.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

function fmtShort(d: Date) {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

type Bucket = {
  key: string;
  label: string;
  start: string;
  end: string;
};

function buildBuckets(period: Period, year: number): Bucket[] {
  const buckets: Bucket[] = [];
  if (period === "day") {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      buckets.push({ key: iso, label: fmtShort(d), start: iso, end: iso });
    }
  } else if (period === "week") {
    for (let w = 1; w <= 53; w++) {
      const { start, end } = isoWeekRange(year, w);
      if (start.getUTCFullYear() > year && w > 1) break;
      const check = isoWeek(start);
      if (check.year !== year) continue;
      buckets.push({
        key: `${year}-W${String(w).padStart(2, "0")}`,
        label: `W${String(w).padStart(2, "0")} (${fmtShort(start)} - ${fmtShort(end)})`,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      });
    }
  } else if (period === "month") {
    for (let m = 0; m < 12; m++) {
      const start = new Date(Date.UTC(year, m, 1));
      const end = new Date(Date.UTC(year, m + 1, 0));
      buckets.push({ key: `${year}-${m}`, label: `${MONTHS[m]} ${year}`, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
    }
  } else {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    buckets.push({ key: `${year}`, label: `${year}`, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
  }
  return buckets;
}

type Row = {
  key: string;
  label: string;
  leadsAdded: number;
  emailsSent: number;
  emailsViewed: number;
  replies: number;
  loomsSent: number;
  loomsWatched: number;
  linkedinSent: number;
  instagramSent: number;
  meetingsBooked: number;
  clientsClosed: number;
};

function emptyRow(b: Bucket): Row {
  return {
    key: b.key,
    label: b.label,
    leadsAdded: 0,
    emailsSent: 0,
    emailsViewed: 0,
    replies: 0,
    loomsSent: 0,
    loomsWatched: 0,
    linkedinSent: 0,
    instagramSent: 0,
    meetingsBooked: 0,
    clientsClosed: 0,
  };
}

function LedgerPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const buckets = useMemo(() => buildBuckets(period, year), [period, year]);
  const rangeStart = buckets[0]?.start ?? `${year}-01-01`;
  const rangeEnd = buckets[buckets.length - 1]?.end ?? `${year}-12-31`;

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["ledger-leads", rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("date_added")
        .gte("date_added", rangeStart)
        .lte("date_added", rangeEnd);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["ledger-events", rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("event_type,occurred_at")
        .gte("occurred_at", `${rangeStart}T00:00:00`)
        .lte("occurred_at", `${rangeEnd}T23:59:59`)
        .in("event_type", [
          "email_sent",
          "email_viewed",
          "email_replied",
          "loom_sent",
          "loom_watched",
          "linkedin_sent",
          "instagram_sent",
          "meeting_booked",
          "client_closed",
        ]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bucketFor = (dateStr: string): string | null => {
    const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
    if (period === "day") return dateStr.slice(0, 10);
    if (period === "week") {
      const { year: y, week } = isoWeek(d);
      return `${y}-W${String(week).padStart(2, "0")}`;
    }
    if (period === "month") return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    return `${d.getUTCFullYear()}`;
  };

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const b of buckets) map.set(b.key, emptyRow(b));
    for (const l of leads ?? []) {
      if (!l.date_added) continue;
      const k = bucketFor(l.date_added);
      const r = k ? map.get(k) : null;
      if (r) r.leadsAdded++;
    }
    for (const e of events ?? []) {
      const k = bucketFor(e.occurred_at);
      const r = k ? map.get(k) : null;
      if (!r) continue;
      switch (e.event_type) {
        case "email_sent": r.emailsSent++; break;
        case "email_viewed": r.emailsViewed++; break;
        case "email_replied": r.replies++; break;
        case "loom_sent": r.loomsSent++; break;
        case "loom_watched": r.loomsWatched++; break;
        case "linkedin_sent": r.linkedinSent++; break;
        case "instagram_sent": r.instagramSent++; break;
        case "meeting_booked": r.meetingsBooked++; break;
        case "client_closed": r.clientsClosed++; break;
      }
    }
    return Array.from(map.values());
  }, [buckets, leads, events, period]);

  const totals = useMemo(() => {
    const t = emptyRow({ key: "total", label: "Total", start: "", end: "" });
    for (const r of rows) {
      t.leadsAdded += r.leadsAdded;
      t.emailsSent += r.emailsSent;
      t.emailsViewed += r.emailsViewed;
      t.replies += r.replies;
      t.loomsSent += r.loomsSent;
      t.loomsWatched += r.loomsWatched;
      t.linkedinSent += r.linkedinSent;
      t.instagramSent += r.instagramSent;
      t.meetingsBooked += r.meetingsBooked;
      t.clientsClosed += r.clientsClosed;
    }
    return t;
  }, [rows]);

  const isLoading = leadsLoading || eventsLoading;

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = cur; y >= cur - 5; y--) arr.push(y);
    return arr;
  }, []);

  const exportCsv = () => {
    const header = [
      "Period",
      "Leads added",
      "Emails sent",
      "Emails viewed",
      "Open %",
      "Replies",
      "Reply %",
      "Looms sent",
      "Looms watched",
      "LinkedIn sent",
      "Instagram sent",
      "Meetings booked",
      "Clients closed",
    ];
    const toRow = (r: Row) => [
      r.label,
      r.leadsAdded,
      r.emailsSent,
      r.emailsViewed,
      pct(r.emailsViewed, r.emailsSent).text,
      r.replies,
      pct(r.replies, r.emailsSent).text,
      r.loomsSent,
      r.loomsWatched,
      r.linkedinSent,
      r.instagramSent,
      r.meetingsBooked,
      r.clientsClosed,
    ];
    downloadCsv(`ledger-${period}-${year}.csv`, [header, ...rows.map(toRow), toRow(totals)]);
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
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[110px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          {isLoading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState title="No data" hint="No activity found for this range." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    {["Period", "Leads added", "Emails sent", "Emails viewed", "Open %", "Replies", "Reply %", "Looms sent", "Looms watched", "LinkedIn sent", "Instagram sent", "Meetings booked", "Clients closed"].map((h) => (
                      <th key={h} className="h-9 whitespace-nowrap px-3 text-right font-medium text-muted-foreground first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="h-9 border-b border-border last:border-0 hover:bg-subtle">
                      <td className="whitespace-nowrap px-3">{r.label}</td>
                      <td className="px-3 text-right tabular-nums">{r.leadsAdded}</td>
                      <td className="px-3 text-right tabular-nums">{r.emailsSent}</td>
                      <td className="px-3 text-right tabular-nums">{r.emailsViewed}</td>
                      <td className="px-3 text-right tabular-nums">{pct(r.emailsViewed, r.emailsSent).text}</td>
                      <td className="px-3 text-right tabular-nums">{r.replies}</td>
                      <td className="px-3 text-right tabular-nums">{pct(r.replies, r.emailsSent).text}</td>
                      <td className="px-3 text-right tabular-nums">{r.loomsSent}</td>
                      <td className="px-3 text-right tabular-nums">{r.loomsWatched}</td>
                      <td className="px-3 text-right tabular-nums">{r.linkedinSent}</td>
                      <td className="px-3 text-right tabular-nums">{r.instagramSent}</td>
                      <td className="px-3 text-right tabular-nums">{r.meetingsBooked}</td>
                      <td className="px-3 text-right tabular-nums">{r.clientsClosed}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="h-9 border-t border-border bg-subtle font-medium sticky bottom-0">
                    <td className="px-3">Total</td>
                    <td className="px-3 text-right tabular-nums">{totals.leadsAdded}</td>
                    <td className="px-3 text-right tabular-nums">{totals.emailsSent}</td>
                    <td className="px-3 text-right tabular-nums">{totals.emailsViewed}</td>
                    <td className="px-3 text-right tabular-nums">{pct(totals.emailsViewed, totals.emailsSent).text}</td>
                    <td className="px-3 text-right tabular-nums">{totals.replies}</td>
                    <td className="px-3 text-right tabular-nums">{pct(totals.replies, totals.emailsSent).text}</td>
                    <td className="px-3 text-right tabular-nums">{totals.loomsSent}</td>
                    <td className="px-3 text-right tabular-nums">{totals.loomsWatched}</td>
                    <td className="px-3 text-right tabular-nums">{totals.linkedinSent}</td>
                    <td className="px-3 text-right tabular-nums">{totals.instagramSent}</td>
                    <td className="px-3 text-right tabular-nums">{totals.meetingsBooked}</td>
                    <td className="px-3 text-right tabular-nums">{totals.clientsClosed}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppPage>
  );
}
