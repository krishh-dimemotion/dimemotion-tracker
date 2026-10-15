// Ported from live chunk lt.dashboard-DBvWXMuV.js
import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, ChevronRight, MailWarning, Send } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useStages, useChannels } from "@/hooks/useLookups";
import { StagePill, stageById } from "@/components/leads/StagePill";
import { cn } from "@/lib/utils";
import { addDaysISO, fmtDate } from "@/lib/format";
// Shared (ported in parallel)
import { CollapsibleCard, Metric, todayISO } from "@/components/live/kit";
import { SheetLink } from "@/components/live/sheet-sync";
import { IS_TEST_MODE } from "@/lib/live/test-mode";
import { followupBlockReason } from "@/lib/live/followup-actions";
import { OutreachRateTiles, RangePicker, resolveRange, useRateRange } from "@/components/lt/outreach-rates";

export const Route = createFileRoute("/lt/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Lead Tracker" },
      { name: "description", content: "Follow-up reminders, volume and outreach performance for the lead pipeline." },
    ],
  }),
  component: DashboardPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type ActiveLead = {
  id: string;
  company_name: string;
  stage_id: string | null;
  channel_id: string | null;
  next_followup_date: string | null;
  archived: boolean;
};

// Live app-shell `r` (Ya): link that opens the lead side panel. TODO: panel; plain link here.
function LeadLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <Link to="/lt/leads/$id" params={{ id }} className={className}>
      {children}
    </Link>
  );
}

function DashboardPage() {
  const range = useRateRange("month");
  const { from, to } = range;
  const today = todayISO();
  const weekAhead = addDaysISO(7, today);
  const { data: stages } = useStages("lead");
  const { data: channels } = useChannels();

  const { data: active } = useQuery({
    queryKey: ["dashboard-active-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,company_name,stage_id,channel_id,next_followup_date,archived")
        .eq("archived", false);
      if (error) throw error;
      return (data ?? []) as ActiveLead[];
    },
  });
  const { data: warmup } = useQuery({
    queryKey: ["dashboard-warmup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sender_accounts")
        .select("id,label,identifier,warmup_reminder_date,channels(name)")
        .not("warmup_reminder_date", "is", null)
        .lte("warmup_reminder_date", today)
        .order("warmup_reminder_date");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: repliesNotInCrm } = useQuery({
    queryKey: ["dashboard-replies-not-in-crm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,company_name,reply_sentiment,crm_records(id)")
        .eq("archived", false)
        .eq("reply_sentiment", "positive");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((l) => !l.crm_records || (Array.isArray(l.crm_records) && l.crm_records.length === 0));
    },
  });

  const channelName = (id: string | null) => ((channels ?? []) as any[]).find((c) => c.id === id)?.name ?? "-";
  const open = (active ?? []).filter((l) => !followupBlockReason(l, stages));
  const overdue = open.filter((l) => l.next_followup_date && l.next_followup_date < today);
  const dueToday = open.filter((l) => l.next_followup_date === today);
  const upcoming = open.filter((l) => l.next_followup_date && l.next_followup_date > today && l.next_followup_date <= weekAhead);
  const weekStart = resolveRange("week", "", "").from;

  const { data: counts } = useQuery({
    queryKey: ["dashboard-counts", weekStart, today],
    queryFn: async () => {
      const [{ count: weekCount }, { count: todayCount }] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("date_added", weekStart),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("date_added", today),
      ]);
      return { weekCount: weekCount ?? 0, todayCount: todayCount ?? 0 };
    },
  });

  const replies = repliesNotInCrm ?? [];

  return (
    // live: guide="lead-dashboard" (repo AppPage has no guide prop)
    <AppPage module="lead" title="Dashboard" perm="lead.dashboard">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end">{!IS_TEST_MODE && <SheetLink />}</div>
        <div className="flex flex-col gap-2">
          {overdue.length > 0 && (
            <Alert
              tone="negative"
              icon={<AlertTriangle className="size-4" />}
              action={
                <Link to="/lt/followups" className="alert-btn">
                  Review now
                </Link>
              }
            >
              <b>
                {overdue.length} follow-up{overdue.length === 1 ? " is" : "s are"} overdue.
              </b>{" "}
              {overdue.slice(0, 3).map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <LeadLink id={l.id} className="underline-offset-2 hover:underline">
                    {l.company_name}
                  </LeadLink>
                </span>
              ))}
              {overdue.length > 3 && ` and ${overdue.length - 3} more`} {overdue.length === 1 ? "is" : "are"} waiting on you.
            </Alert>
          )}
          {dueToday.length > 0 && (
            <Alert
              tone="warning"
              icon={<Calendar className="size-4" />}
              action={
                <Link to="/lt/followups" className="alert-btn">
                  Open follow-ups
                </Link>
              }
            >
              <b>
                {dueToday.length} follow-up{dueToday.length === 1 ? "" : "s"} due today.
              </b>{" "}
              Clear them before the day ends.
            </Alert>
          )}
          {replies.length > 0 && (
            <Alert
              tone="info"
              icon={<Send className="size-4" />}
              action={
                <Link to="/lt/leads" className="alert-btn">
                  Open leads
                </Link>
              }
            >
              <b>
                {replies.length} positive repl{replies.length === 1 ? "y is" : "ies are"} not in the CRM yet:
              </b>{" "}
              {replies.slice(0, 4).map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <LeadLink id={l.id} className="underline-offset-2 hover:underline">
                    {l.company_name}
                  </LeadLink>
                </span>
              ))}
              {replies.length > 4 && ` and ${replies.length - 4} more`}. Push them from their lead page.
            </Alert>
          )}
          {warmup && warmup.length > 0 && (
            <Alert
              tone="warning"
              icon={<MailWarning className="size-4" />}
              action={
                <Link to="/settings" className="alert-btn">
                  Manage accounts
                </Link>
              }
            >
              <b>
                {warmup.length} sender account{warmup.length === 1 ? " needs" : "s need"} a warm-up check:
              </b>{" "}
              {warmup.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && "; "}
                  <span className="font-medium">{a.label}</span>
                  {a.identifier && a.identifier !== a.label ? ` (${a.identifier})` : ""}
                  {a.channels?.name ? ` on ${a.channels.name}` : ""},{" "}
                  {a.warmup_reminder_date < today ? `overdue since ${fmtDate(a.warmup_reminder_date)}` : "due today"}
                </span>
              ))}
              . {/* TODO: live HelpLink section="warmup-check" label="What is a warm-up check?" */}
            </Alert>
          )}
        </div>
        <RangePicker range={range} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Leads added this week" value={counts?.weekCount ?? 0} />
          <Metric label="Leads added today" value={counts?.todayCount ?? 0} />
          <Metric label="Total active leads" value={(active ?? []).length} />
          <Metric label="Overdue follow-ups" value={overdue.length} tone={overdue.length ? "negative" : undefined} />
        </div>
        <OutreachRateTiles from={from} to={to} />
        <div className="flex flex-col gap-3">
          <FollowupGroup id="dashboard.overdue" title="Overdue" tone="negative" leads={overdue} stages={stages} channelName={channelName} />
          <FollowupGroup id="dashboard.due_today" title="Due today" tone="warning" leads={dueToday} stages={stages} channelName={channelName} />
          <FollowupGroup id="dashboard.upcoming" title="Upcoming (7 days)" tone="neutral" leads={upcoming} stages={stages} channelName={channelName} />
        </div>
      </div>
    </AppPage>
  );
}

function Alert({ tone, icon, action, children }: { tone: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  const c = `var(--${tone})`;
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] sm:flex-nowrap"
      style={{
        backgroundColor: `color-mix(in oklab, ${c} 8%, var(--surface))`,
        borderColor: `color-mix(in oklab, ${c} 28%, transparent)`,
      }}
    >
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `color-mix(in oklab, ${c} 16%, var(--surface))`, color: c }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 basis-[220px] [&_b]:font-semibold">{children}</div>
      {action && (
        <div className="ml-11 shrink-0 sm:ml-0 [&_.alert-btn]:inline-flex [&_.alert-btn]:h-8 [&_.alert-btn]:items-center [&_.alert-btn]:rounded-lg [&_.alert-btn]:border [&_.alert-btn]:border-border [&_.alert-btn]:bg-surface [&_.alert-btn]:px-3 [&_.alert-btn]:text-[12.5px] [&_.alert-btn]:font-medium [&_.alert-btn]:shadow-xs hover:[&_.alert-btn]:border-foreground/25">
          {action}
        </div>
      )}
    </div>
  );
}

function FollowupGroup({
  id,
  title,
  tone,
  leads,
  stages,
  channelName,
}: {
  id: string;
  title: string;
  tone: "negative" | "warning" | "neutral";
  leads: ActiveLead[];
  stages: any;
  channelName: (id: string | null) => string;
}) {
  const textTone = tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning" : "text-foreground";
  const dot = tone === "negative" ? "var(--negative)" : tone === "warning" ? "var(--warning)" : "var(--info)";
  return (
    <CollapsibleCard
      id={id}
      title={
        <span className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: dot, boxShadow: `0 0 0 3px color-mix(in oklab, ${dot} 18%, transparent)` }}
          />
          {title}
        </span>
      }
      defaultOpen={false}
      actions={<span className={cn("text-[15px] font-semibold", textTone)}>{leads.length}</span>}
    >
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {leads.length === 0 && <div className="label-text py-4 text-center">Nothing here</div>}
        {leads.map((l) => (
          <LeadLink
            key={l.id}
            id={l.id}
            className="group flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-subtle"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-subtle font-mono text-[10px] font-semibold text-muted-foreground">
                {(l.company_name || "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate font-medium group-hover:underline group-hover:underline-offset-4">{l.company_name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="hidden sm:inline-flex">
                <StagePill stage={stageById(stages, l.stage_id)} />
              </span>
              <span className="label-text hidden w-20 truncate md:inline">{channelName(l.channel_id)}</span>
              <span className="label-text tabular w-[72px] text-right whitespace-nowrap">{fmtDate(l.next_followup_date)}</span>
              <ChevronRight className="size-3.5 text-faint" />
            </span>
          </LeadLink>
        ))}
      </div>
    </CollapsibleCard>
  );
}
