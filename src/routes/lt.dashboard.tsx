import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { Card, Metric, Pill, EmptyState, Loading } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useStages, useChannels } from "@/hooks/useLookups";
import { pct, fmtDate, todayISO, addDaysISO } from "@/lib/format";
import { StagePill, stageById } from "@/components/leads/StagePill";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Lead Tracker" },
      { name: "description", content: "Follow-up reminders, volume and outreach performance for the lead pipeline." },
      { property: "og:title", content: "Dashboard | Lead Tracker" },
      { property: "og:description", content: "Follow-up reminders, volume and outreach performance for the lead pipeline." },
    ],
  }),
  component: DashboardPage,
});

type RangeKey = "today" | "week" | "month" | "30d" | "custom";

function rangeToDates(key: RangeKey, customFrom: string, customTo: string) {
  const today = todayISO();
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    const d = new Date(today);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    return { from: addDaysISO(-diff, today), to: today };
  }
  if (key === "month") {
    return { from: today.slice(0, 8) + "01", to: today };
  }
  if (key === "30d") return { from: addDaysISO(-29, today), to: today };
  return { from: customFrom || today, to: customTo || today };
}

function DashboardPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const { from, to } = rangeToDates(rangeKey, customFrom, customTo);
  const today = todayISO();
  const upper7 = addDaysISO(7, today);

  const { data: stages } = useStages("lead");
  const { data: channels } = useChannels();

  const { data: leads, isLoading } = useQuery({
    queryKey: ["dashboard-leads", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .gte("date_added", from)
        .lte("date_added", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allActive } = useQuery({
    queryKey: ["dashboard-active-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,company_name,stage_id,channel_id,next_followup_date,archived")
        .eq("archived", false);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: warmupAccounts } = useQuery({
    queryKey: ["dashboard-warmup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sender_accounts")
        .select("id,label,warmup_reminder_date")
        .not("warmup_reminder_date", "is", null)
        .lte("warmup_reminder_date", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  const channelName = (id: string | null) => channels?.find((c) => c.id === id)?.name ?? "—";

  const overdue = (allActive ?? []).filter((l) => l.next_followup_date && l.next_followup_date < today);
  const dueToday = (allActive ?? []).filter((l) => l.next_followup_date === today);
  const upcoming = (allActive ?? []).filter(
    (l) => l.next_followup_date && l.next_followup_date > today && l.next_followup_date <= upper7,
  );

  const weekStart = rangeToDates("week", "", "").from;
  const addedThisWeek = (allActive ?? []).length ? undefined : undefined;

  const { data: weekAndTodayCounts } = useQuery({
    queryKey: ["dashboard-counts", weekStart, today],
    queryFn: async () => {
      const [{ count: weekCount }, { count: todayCount }] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("date_added", weekStart),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("date_added", today),
      ]);
      return { weekCount: weekCount ?? 0, todayCount: todayCount ?? 0 };
    },
  });

  const outreach = useMemo(() => {
    const rows = leads ?? [];
    const total = rows.length;
    const anySent = rows.filter((l) => l.email_sent || l.linkedin_sent || l.instagram_sent).length;
    const emailSent = rows.filter((l) => l.email_sent).length;
    const emailViewed = rows.filter((l) => l.email_viewed).length;
    const replied = rows.filter((l) => l.email_replied).length;
    const positive = rows.filter((l) => l.reply_sentiment === "positive").length;
    const negative = rows.filter((l) => l.reply_sentiment === "negative").length;
    const loomSent = rows.filter((l) => l.loom_sent).length;
    const loomWatched = rows.filter((l) => l.loom_watched).length;
    const watchPercents = rows.filter((l) => l.loom_watched && l.loom_watch_percent != null).map((l) => l.loom_watch_percent as number);
    const avgWatch = watchPercents.length ? watchPercents.reduce((a, b) => a + b, 0) / watchPercents.length : 0;
    const meetings = rows.filter((l) => l.meeting_booked).length;
    const closed = rows.filter((l) => l.client_closed).length;
    return {
      total,
      outreachSent: pct(anySent, total),
      emailSentRate: pct(emailSent, total),
      emailViewRate: pct(emailViewed, emailSent),
      replyRate: pct(replied, emailSent),
      positiveRate: pct(positive, replied),
      negativeRate: pct(negative, replied),
      loomSentRate: pct(loomSent, emailSent),
      loomViewRate: pct(loomWatched, loomSent),
      avgWatch: watchPercents.length ? `${Math.round(avgWatch)}%` : "0%",
      avgWatchHasData: watchPercents.length > 0,
      meetingRate: pct(meetings, replied),
      closeRate: pct(closed, meetings),
      counts: { anySent, total, emailSent, emailViewed, replied, positive, negative, loomSent, loomWatched, meetings, closed },
    };
  }, [leads]);

  return (
    <AppPage module="lead" title="Dashboard" perm="lead.dashboard">
      <div className="flex flex-col gap-4">
        {warmupAccounts && warmupAccounts.length > 0 && (
          <div className="rounded-lg border border-warning bg-card px-4 py-2 text-[13px] text-warning">
            {warmupAccounts.length} account{warmupAccounts.length === 1 ? "" : "s"} need a warm-up check
          </div>
        )}

        <Card className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "30d", "custom"] as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRangeKey(k)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[13px]",
                rangeKey === k ? "border-info text-info bg-subtle" : "border-border text-muted-foreground",
              )}
            >
              {k === "today" ? "Today" : k === "week" ? "This week" : k === "month" ? "This month" : k === "30d" ? "Last 30 days" : "Custom"}
            </button>
          ))}
          {rangeKey === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" className="h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="text-muted-foreground">to</span>
              <input type="date" className="h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ReminderCard title="Overdue" tone="negative" leads={overdue} stages={stages} channelName={channelName} />
          <ReminderCard title="Due today" tone="warning" leads={dueToday} stages={stages} channelName={channelName} />
          <ReminderCard title="Upcoming (7 days)" tone="neutral" leads={upcoming} stages={stages} channelName={channelName} />
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Leads added this week" value={weekAndTodayCounts?.weekCount ?? 0} />
          <Metric label="Leads added today" value={weekAndTodayCounts?.todayCount ?? 0} />
          <Metric label="Total active leads" value={(allActive ?? []).length} />
          <Metric label="Overdue follow-ups" value={overdue.length} tone={overdue.length ? "negative" : undefined} />
        </div>

        {isLoading ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <OutreachMetric label="Outreach sent rate" p={outreach.outreachSent} frac={`${outreach.counts.anySent}/${outreach.counts.total}`} />
            <OutreachMetric label="Email sent rate" p={outreach.emailSentRate} frac={`${outreach.counts.emailSent}/${outreach.counts.total}`} />
            <OutreachMetric label="Email view rate" p={outreach.emailViewRate} frac={`${outreach.counts.emailViewed}/${outreach.counts.emailSent}`} />
            <OutreachMetric label="Reply rate" p={outreach.replyRate} frac={`${outreach.counts.replied}/${outreach.counts.emailSent}`} />
            <OutreachMetric label="Positive reply rate" p={outreach.positiveRate} frac={`${outreach.counts.positive}/${outreach.counts.replied}`} />
            <OutreachMetric label="Negative reply rate" p={outreach.negativeRate} frac={`${outreach.counts.negative}/${outreach.counts.replied}`} />
            <OutreachMetric label="Loom sent rate" p={outreach.loomSentRate} frac={`${outreach.counts.loomSent}/${outreach.counts.emailSent}`} />
            <OutreachMetric label="Loom view rate" p={outreach.loomViewRate} frac={`${outreach.counts.loomWatched}/${outreach.counts.loomSent}`} />
            <OutreachMetric label="Avg loom watch %" p={{ text: outreach.avgWatch, hasData: outreach.avgWatchHasData }} frac={`over ${outreach.counts.loomWatched} watched`} />
            <OutreachMetric label="Meetings booked rate" p={outreach.meetingRate} frac={`${outreach.counts.meetings}/${outreach.counts.replied}`} />
            <OutreachMetric label="Client close rate" p={outreach.closeRate} frac={`${outreach.counts.closed}/${outreach.counts.meetings}`} />
          </div>
        )}
      </div>
    </AppPage>
  );
}

function OutreachMetric({ p, label, frac }: { p: { text: string; hasData: boolean }; label: string; frac: string }) {
  return <Metric label={label} value={p.text} helper={p.hasData ? frac : "no data yet"} />;
}

function ReminderCard({
  title,
  tone,
  leads,
  stages,
  channelName,
}: {
  title: string;
  tone: "negative" | "warning" | "neutral";
  leads: { id: string; company_name: string; stage_id: string | null; channel_id: string | null; next_followup_date: string | null }[];
  stages: ReturnType<typeof useStages>["data"];
  channelName: (id: string | null) => string;
}) {
  const toneClass = tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card title={title} actions={<span className={cn("text-[15px] font-semibold", toneClass)}>{leads.length}</span>}>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {leads.length === 0 && <div className="label-text py-4 text-center">Nothing here</div>}
        {leads.map((l) => (
          <Link
            key={l.id}
            to="/lt/leads/$id"
            params={{ id: l.id }}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-subtle"
          >
            <span className="truncate">{l.company_name}</span>
            <span className="flex items-center gap-2 shrink-0">
              <StagePill stage={stageById(stages, l.stage_id)} />
              <span className="label-text w-16">{channelName(l.channel_id)}</span>
              <span className="label-text w-20">{fmtDate(l.next_followup_date)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
