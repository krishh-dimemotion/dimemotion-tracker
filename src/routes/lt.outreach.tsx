// Ported from live chunk lt.outreach-Brp1ggKl.js
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { AppPage } from "@/components/app-shell";
import { Card, CollapsibleCard, DateRangePicker, EmptyState, Loading, addDaysISO, todayISO } from "@/components/live/kit";
import { HelpIcon } from "@/components/lt/help-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useChannels, useSenderAccounts } from "@/hooks/useLookups";
import { useAuth } from "@/lib/live/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/outreach")({
  head: () => ({ meta: [{ title: "Outreach Tracker | Lead Tracker" }] }),
  component: OutreachPage,
});

const RANGE_LABELS = {
  week: "This week",
  month: "This month",
  "30d": "Last 30 days",
  "90d": "Last 3 months",
  year: "This year",
  custom: "Custom",
} as const;
type RangeKey = keyof typeof RANGE_LABELS;
const MAX_DAYS = 366;

function resolveRange(key: RangeKey, customFrom: string, customTo: string) {
  const today = todayISO();
  if (key === "week") {
    const dow = new Date(today + "T12:00:00").getDay();
    return { from: addDaysISO(-(dow === 0 ? 6 : dow - 1), today), to: today };
  }
  if (key === "month") return { from: today.slice(0, 8) + "01", to: today };
  if (key === "30d") return { from: addDaysISO(-29, today), to: today };
  if (key === "90d") return { from: addDaysISO(-89, today), to: today };
  if (key === "year") return { from: today.slice(0, 5) + "01-01", to: today };
  let from = customFrom || today;
  let to = customTo || today;
  if (from > to) [from, to] = [to, from];
  if (to > today) to = today;
  const floor = addDaysISO(-365, to);
  if (from < floor) from = floor;
  return { from, to };
}

function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= MAX_DAYS; d = addDaysISO(1, d)) out.push(d);
  return out;
}

type Layout = { compact: boolean; streak: boolean; charts: boolean; table: boolean };
const DEFAULT_LAYOUT: Layout = { compact: false, streak: true, charts: true, table: true };
const LAYOUT_KEY = "tracker.outreach.layout";
const SHADES = [90, 60, 38, 22, 12].map((p) => `color-mix(in oklch, var(--foreground) ${p}%, var(--background))`);

function dayLabel(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
};

type Row = Record<string, unknown>;

function OutreachPage() {
  const { user } = useAuth() as unknown as { user: { id: string } | null };
  const qc = useQueryClient();
  const { data: channels } = useChannels();
  const { data: senders } = useSenderAccounts();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState(addDaysISO(-29));
  const [customTo, setCustomTo] = useState(todayISO());
  const { from, to } = resolveRange(rangeKey, customFrom, customTo);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LAYOUT_KEY);
      if (v) setLayout({ ...DEFAULT_LAYOUT, ...JSON.parse(v) });
    } catch {
      // ignore
    }
  }, []);
  const updateLayout = (patch: Partial<Layout>) =>
    setLayout((l) => {
      const next = { ...l, ...patch };
      try {
        window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  const [editing, setEditing] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const activeChannels = useMemo(
    () => ((channels ?? []) as { id: string; name: string; is_active?: boolean | null }[]).filter((c) => c.is_active !== false),
    [channels],
  );
  const [channelFilter, setChannelFilter] = useState("all");
  const shown = useMemo(
    () => (channelFilter === "all" ? activeChannels : activeChannels.filter((c) => c.id === channelFilter)),
    [activeChannels, channelFilter],
  );
  useEffect(() => {
    if (channelFilter !== "all" && !activeChannels.some((c) => c.id === channelFilter)) setChannelFilter("all");
  }, [activeChannels, channelFilter]);

  const today = todayISO();
  const fetchFrom = from < today ? from : today;

  const { data: targets } = useQuery({
    queryKey: ["outreach-targets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_targets").select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const { data: daily } = useQuery({
    queryKey: ["outreach-daily", fetchFrom, user?.id],
    queryFn: async () => {
      let q = supabase.from("outreach_daily").select("*").gte("day", fetchFrom);
      if (user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!user?.id,
  });
  const { data: auto, isLoading } = useQuery({
    queryKey: ["outreach-auto", fetchFrom],
    queryFn: async () => {
      // outreach_auto is a view of automatic counts per day, channel and sender account.
      const { data, error } = await supabase.from("outreach_auto" as never).select("*").gte("day", fetchFrom);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const targetFor = (channelId: string) => {
    const mine = (targets ?? []).find((t) => t.channel_id === channelId && t.user_id === user?.id);
    if (mine) return mine.daily_target as number;
    const def = (targets ?? []).find((t) => t.channel_id === channelId && t.user_id === null);
    return def ? (def.daily_target as number) : 0;
  };

  const autoMap = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of auto ?? []) {
      const day = r.day as string;
      const ch = r.channel_id as string;
      if (!day || !ch) continue;
      if (!m.has(day)) m.set(day, new Map());
      const inner = m.get(day)!;
      inner.set(ch, (inner.get(ch) ?? 0) + ((r.auto_count as number) ?? 0));
    }
    return m;
  }, [auto]);
  const manualMap = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of daily ?? []) {
      const day = r.day as string;
      if (!m.has(day)) m.set(day, new Map());
      const inner = m.get(day)!;
      inner.set(r.channel_id as string, (inner.get(r.channel_id as string) ?? 0) + ((r.manual_count as number) ?? 0));
    }
    return m;
  }, [daily]);

  const autoCount = (d: string, ch: string) => autoMap.get(d)?.get(ch) ?? 0;
  const manualCount = (d: string, ch: string) => manualMap.get(d)?.get(ch) ?? 0;
  const total = (d: string, ch: string) => autoCount(d, ch) + manualCount(d, ch);
  const dayTotal = (d: string) => shown.reduce((s, c) => s + total(d, c.id), 0);
  const dailyTarget = shown.reduce((s, c) => s + targetFor(c.id), 0);

  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const daysDesc = useMemo(() => [...days].reverse(), [days]);

  const onTarget = useMemo(() => {
    if (dailyTarget <= 0) return { hit: 0, total: days.length };
    let hit = 0;
    for (const d of days) if (dayTotal(d) >= dailyTarget) hit++;
    return { hit, total: days.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, autoMap, manualMap, dailyTarget]);
  const isHit = (d: string) => (dailyTarget > 0 ? dayTotal(d) >= dailyTarget : dayTotal(d) > 0);
  const streak = useMemo(() => {
    let best = 0;
    let run = 0;
    for (const d of days) {
      run = isHit(d) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    let current = 0;
    let d = isHit(today) ? today : addDaysISO(-1, today);
    for (let i = 0; i < 400 && isHit(d); i++) {
      current++;
      d = addDaysISO(-1, d);
    }
    return { best, current };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, autoMap, manualMap, dailyTarget, today]);
  const avgPerDay = days.length ? Math.round(days.reduce((s, d) => s + dayTotal(d), 0) / days.length) : 0;
  const colorFor = (_c: unknown, i: number) => SHADES[i % SHADES.length];

  const chartData = useMemo(
    () =>
      days.map((d) => {
        const row: Record<string, string | number> = {
          day: d,
          label: new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
        };
        for (const c of shown) row[c.id] = total(d, c.id);
        return row;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, shown, autoMap, manualMap],
  );
  const pieData = useMemo(
    () =>
      shown
        .map((c, i) => ({
          id: c.id,
          name: c.name,
          color: colorFor(c, i),
          value: days.reduce((s, d) => s + total(d, c.id), 0),
        }))
        .filter((p) => p.value > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, shown, autoMap, manualMap],
  );
  const pieTotal = pieData.reduce((s, p) => s + p.value, 0);
  const activeDays = days.filter((d) => dayTotal(d) > 0).length;

  const sendersByChannel = useMemo(() => {
    const m = new Map<string, { id: string; label: string }[]>();
    for (const s of (senders ?? []) as { id: string; label: string; channel_id: string | null }[]) {
      if (!s.channel_id) continue;
      if (!m.has(s.channel_id)) m.set(s.channel_id, []);
      m.get(s.channel_id)!.push(s);
    }
    return m;
  }, [senders]);
  const senderToday = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of auto ?? []) {
      if (r.day !== today || !r.sender_account_id) continue;
      const k = r.sender_account_id as string;
      m.set(k, (m.get(k) ?? 0) + ((r.auto_count as number) ?? 0));
    }
    return m;
  }, [auto, today]);
  const senderRange = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of auto ?? []) {
      const day = r.day as string;
      if (!r.sender_account_id || !day || day < from || day > to) continue;
      const k = r.sender_account_id as string;
      m.set(k, (m.get(k) ?? 0) + ((r.auto_count as number) ?? 0));
    }
    return m;
  }, [auto, from, to]);

  const bump = async (channelId: string, delta: number) => {
    if (!user?.id || !delta) return;
    const current = ((daily ?? []).find((r) => r.day === today && r.channel_id === channelId)?.manual_count as number) ?? 0;
    const { error } = await supabase
      .from("outreach_daily")
      .upsert({ day: today, user_id: user.id, channel_id: channelId, manual_count: current + delta } as never, {
        onConflict: "day,user_id,channel_id",
      });
    if (!error) {
      setAmounts((a) => ({ ...a, [channelId]: "" }));
      void qc.invalidateQueries({ queryKey: ["outreach-daily"] });
    }
  };
  const saveCell = async (day: string, channelId: string, raw: string) => {
    if (!user?.id) return;
    const n = Math.round(Number(raw));
    if (raw.trim() === "" || !Number.isFinite(n) || n < 0 || n === total(day, channelId)) return;
    setSavingCell(`${day}:${channelId}`);
    const { error } = await supabase
      .from("outreach_daily")
      .upsert(
        { day, user_id: user.id, channel_id: channelId, manual_count: n - autoCount(day, channelId) } as never,
        { onConflict: "day,user_id,channel_id" },
      );
    setSavingCell(null);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["outreach-daily"] });
  };
  const amountOf = (channelId: string) => {
    const v = amounts[channelId];
    const n = Number(v);
    return v && !Number.isNaN(n) ? n : 0;
  };

  const segBtn = (active: boolean) =>
    cn(
      "pressable rounded-[7px] px-3 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors",
      active ? "bg-foreground text-background shadow-xs" : "text-muted-foreground hover:text-foreground",
    );

  return (
    // live: guide="outreach-tracker" (repo AppPage has no guide prop)
    <AppPage module="lead" title="Outreach Tracker" perm="lead.outreach_tracker">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full flex-wrap gap-0.5 rounded-[10px] border border-border bg-subtle p-[3px]">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <button key={k} type="button" onClick={() => setRangeKey(k)} className={segBtn(rangeKey === k)}>
                {RANGE_LABELS[k]}
              </button>
            ))}
          </div>
          {rangeKey === "custom" && (
            <DateRangePicker
              from={customFrom}
              to={customTo}
              onChange={(f: string, t: string) => {
                setCustomFrom(f);
                setCustomTo(t);
              }}
              className="w-[260px]"
            />
          )}
          {activeChannels.length > 1 && (
            <div className="flex max-w-full flex-wrap gap-0.5 rounded-[10px] border border-border bg-subtle p-[3px]">
              {[{ id: "all", name: "All channels" }, ...activeChannels].map((c) => (
                <button key={c.id} type="button" onClick={() => setChannelFilter(c.id)} className={segBtn(channelFilter === c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="pressable ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-medium shadow-xs hover:border-foreground/25"
              >
                <SlidersHorizontal className="size-3.5" />
                Customize
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[260px] p-2">
              <div className="section-label px-2 pt-1 pb-2">Page layout</div>
              {(
                [
                  ["compact", "Compact channel cards"],
                  ["charts", "Charts"],
                  ["streak", "Streak and history"],
                  ["table", "Daily numbers"],
                ] as [keyof Layout, string][]
              ).map(([k, label]) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-subtle"
                >
                  {label}
                  <Switch checked={layout[k]} onCheckedChange={(v) => updateLayout({ [k]: v })} />
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {isLoading ? (
          <Loading />
        ) : activeChannels.length === 0 ? (
          <EmptyState title="No active channels" hint="Add channels in settings to track outreach." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((c) => {
                const a = autoCount(today, c.id);
                const m = manualCount(today, c.id);
                const t = a + m;
                const target = targetFor(c.id);
                const remaining = Math.max(0, target - t);
                const pctDone = target > 0 ? Math.min(100, (t / target) * 100) : 0;
                const chSenders = sendersByChannel.get(c.id) ?? [];
                return (
                  <Card key={c.id} title={c.name} className={layout.compact ? "p-4" : undefined}>
                    <div className="flex items-baseline justify-between">
                      <div className="metric-number">{t}</div>
                      <div className="label-text">/ {target || "-"} today</div>
                    </div>
                    <div className={cn("label-text mt-1 flex items-center gap-1", layout.compact && "hidden")}>
                      Automatic {a} + Manual {m >= 0 ? `+${m}` : m} = {t}
                      <HelpIcon section="automatic-vs-manual" label="Automatic vs manual counts" />
                    </div>
                    <Progress value={pctDone} className="mt-2 h-1.5" />
                    <div className="label-text mt-1">{target > 0 ? `${remaining} remaining` : "No target set"}</div>
                    {!layout.compact && (
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => bump(c.id, -(amountOf(c.id) || 1))}>
                            -
                          </Button>
                          <Input
                            type="number"
                            placeholder="Amount"
                            className="h-8 text-[13px]"
                            value={amounts[c.id] ?? ""}
                            onChange={(e) => setAmounts((s) => ({ ...s, [c.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" onClick={() => bump(c.id, amountOf(c.id) || 1)}>
                            +
                          </Button>
                        </div>
                        {chSenders.length > 0 && (
                          <div className="mt-3 border-t border-border pt-2">
                            <div className="label-text mb-1">By sender account</div>
                            <div className="flex flex-col gap-1">
                              {chSenders.map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-2 text-[13px]">
                                  <span className="min-w-0 truncate">{s.label}</span>
                                  <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                                    {senderToday.get(s.id) ?? 0} today · {senderRange.get(s.id) ?? 0} in range
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                );
              })}
            </div>

            {layout.charts && (
              <CollapsibleCard
                id="outreach.charts"
                title="Outreach over time"
                actions={
                  <span className="label-text">
                    {pieTotal} sent · {activeDays} active {activeDays === 1 ? "day" : "days"}
                  </span>
                }
              >
                {pieTotal === 0 ? (
                  <EmptyState title="Nothing sent in this range" />
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                            stroke="var(--border)"
                            minTickGap={16}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                            stroke="var(--border)"
                          />
                          <ChartTooltip cursor={{ fill: "var(--subtle)" }} contentStyle={TOOLTIP_STYLE} />
                          {shown.map((c, i) => (
                            <Bar
                              key={c.id}
                              dataKey={c.id}
                              name={c.name}
                              stackId="sent"
                              fill={colorFor(c, i)}
                              radius={i === shown.length - 1 ? [3, 3, 0, 0] : 0}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-40 w-40 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={42}
                              outerRadius={70}
                              stroke="var(--surface)"
                              strokeWidth={2}
                            >
                              {pieData.map((p) => (
                                <Cell key={p.id} fill={p.color} />
                              ))}
                            </Pie>
                            <ChartTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "var(--foreground)" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
                        {pieData.map((p) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="min-w-0 truncate">{p.name}</span>
                            <span className="ml-auto pl-2 tabular-nums text-muted-foreground">
                              {p.value} · {Math.round((p.value / pieTotal) * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CollapsibleCard>
            )}

            {layout.streak && (
              <CollapsibleCard id="outreach.streak" title="Streak and history" help={<HelpIcon section="outreach-tracker" />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ["Current streak", `${streak.current} ${streak.current === 1 ? "day" : "days"}`],
                      ["Best in range", `${streak.best} ${streak.best === 1 ? "day" : "days"}`],
                      [
                        dailyTarget > 0 ? "Days on target" : "Days with outreach",
                        `${dailyTarget > 0 ? onTarget.hit : activeDays} of ${days.length}`,
                      ],
                      ["Average per day", String(avgPerDay)],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border/80 px-3 py-2.5">
                      <div className="label-text">{label}</div>
                      <div className="mt-0.5 text-[18px] font-semibold tracking-tight tabular-nums">{value}</div>
                    </div>
                  ))}
                </div>
                <TooltipProvider>
                  <div className="mt-3 flex flex-wrap gap-[3px]">
                    {days.map((d) => {
                      const sent = dayTotal(d);
                      const state = isHit(d) ? "hit" : sent > 0 ? "some" : "none";
                      return (
                        <Tooltip key={d}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "h-3 w-3 rounded-[3px]",
                                state === "hit" ? "bg-foreground" : state === "some" ? "bg-foreground/35" : "bg-foreground/8",
                                d === today && "ring-1 ring-foreground/60 ring-offset-1 ring-offset-background",
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {dayLabel(d)}: {sent} sent
                            {dailyTarget > 0 ? (state === "hit" ? " · target hit" : ` of ${dailyTarget}`) : ""}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
                <div className="label-text mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground" />
                    {dailyTarget > 0 ? "Target hit" : "Sent"}
                  </span>
                  {dailyTarget > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/35" />
                      Some sent
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/8" />
                    None
                  </span>
                  <span>One square per day, oldest first.</span>
                </div>
              </CollapsibleCard>
            )}

            {layout.table && (
              <CollapsibleCard
                id="outreach.table"
                title="Daily numbers"
                className="overflow-hidden"
                actions={
                  <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)}>
                    {editing ? "Done" : "Edit numbers"}
                  </Button>
                }
              >
                <div className="max-h-[480px] overflow-y-auto">
                  {editing && (
                    <div className="border-b border-border px-3 py-2 text-[12px] text-muted-foreground">
                      Type the real number of outreach for any day and click away to save. Leads you marked as sent are
                      counted automatically; your number replaces the day's total for that channel.
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="sticky top-0 bg-surface">
                        <tr className="border-b border-border">
                          <th className="h-9 px-3 text-left font-medium text-muted-foreground">Date</th>
                          {shown.map((c) => (
                            <th key={c.id} className="h-9 px-3 text-right font-medium text-muted-foreground">
                              {c.name}
                            </th>
                          ))}
                          <th className="h-9 px-3 text-right font-medium text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {daysDesc.map((d) => (
                          <tr key={d} className="h-9 border-b border-border last:border-0 hover:bg-subtle">
                            <td className="px-3 whitespace-nowrap">{dayLabel(d)}</td>
                            {shown.map((c) => (
                              <td key={c.id} className="px-3 text-right tabular-nums">
                                {editing ? (
                                  <Input
                                    key={`${d}:${c.id}:${total(d, c.id)}`}
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    defaultValue={total(d, c.id)}
                                    disabled={savingCell === `${d}:${c.id}`}
                                    aria-label={`${c.name} on ${dayLabel(d)}`}
                                    className="ml-auto h-7 w-20 text-right text-[13px]"
                                    onBlur={(e) => void saveCell(d, c.id, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                    }}
                                  />
                                ) : (
                                  total(d, c.id)
                                )}
                              </td>
                            ))}
                            <td className="px-3 text-right font-medium tabular-nums">{dayTotal(d)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CollapsibleCard>
            )}
          </>
        )}
      </div>
    </AppPage>
  );
}
