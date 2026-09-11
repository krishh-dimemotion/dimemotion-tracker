import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useChannels } from "@/hooks/useLookups";
import { addDaysISO, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/outreach")({
  head: () => ({
    meta: [
      { title: "Outreach Tracker | Lead Tracker" },
      { name: "description", content: "Daily outreach volume against targets by channel." },
      { property: "og:title", content: "Outreach Tracker | Lead Tracker" },
      { property: "og:description", content: "Daily outreach volume against targets by channel." },
    ],
  }),
  component: OutreachPage,
});

const CHANNEL_EVENT: Record<string, string> = {
  email: "email_sent",
  linkedin: "linkedin_sent",
  instagram: "instagram_sent",
};

const HISTORY_DAYS = 30;
const GRID_DAYS = 84; // 12 weeks x 7 days

function dayLabel(d: string) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
}

function OutreachPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: channels } = useChannels();
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});

  const activeChannels = useMemo(
    () => (channels ?? []).filter((c: any) => c.is_active !== false),
    [channels],
  );

  const rangeStart = addDaysISO(-(GRID_DAYS - 1));
  const today = todayISO();

  const { data: targets } = useQuery({
    queryKey: ["outreach-targets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_targets").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: manual } = useQuery({
    queryKey: ["outreach-daily", rangeStart, user?.id],
    queryFn: async () => {
      let q = supabase.from("outreach_daily").select("*").gte("day", rangeStart);
      if (user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["outreach-events", rangeStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("event_type,occurred_at,meta")
        .gte("occurred_at", `${rangeStart}T00:00:00`)
        .in("event_type", ["email_sent", "linkedin_sent", "instagram_sent", "followup_sent"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const targetFor = (channelId: string) => {
    const own = (targets ?? []).find((t: any) => t.channel_id === channelId && t.user_id === user?.id);
    if (own) return own.daily_target as number;
    const global = (targets ?? []).find((t: any) => t.channel_id === channelId && t.user_id === null);
    return global ? (global.daily_target as number) : 0;
  };

  // day -> channelId -> count from events
  const eventCounts = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const e of events ?? []) {
      const day = String(e.occurred_at).slice(0, 10);
      let channelId: string | null = null;
      const kind = (activeChannels.find((c: any) => CHANNEL_EVENT[c.kind] === e.event_type)?.id) ?? null;
      if (e.event_type === "followup_sent") {
        channelId = (e.meta as any)?.channel_id ?? null;
      } else {
        channelId = kind;
      }
      if (!channelId) continue;
      if (!map.has(day)) map.set(day, new Map());
      const inner = map.get(day)!;
      inner.set(channelId, (inner.get(channelId) ?? 0) + 1);
    }
    return map;
  }, [events, activeChannels]);

  const manualCounts = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const m of manual ?? []) {
      if (!map.has(m.day)) map.set(m.day, new Map());
      map.get(m.day)!.set(m.channel_id, (map.get(m.day)!.get(m.channel_id) ?? 0) + (m.manual_count ?? 0));
    }
    return map;
  }, [manual]);

  const countFor = (day: string, channelId: string) => {
    const auto = eventCounts.get(day)?.get(channelId) ?? 0;
    const man = manualCounts.get(day)?.get(channelId) ?? 0;
    return auto + man;
  };

  const totalFor = (day: string) => activeChannels.reduce((sum: number, c: any) => sum + countFor(day, c.id), 0);
  const combinedTarget = activeChannels.reduce((sum: number, c: any) => sum + targetFor(c.id), 0);

  const gridDays = useMemo(() => {
    const arr: string[] = [];
    for (let i = GRID_DAYS - 1; i >= 0; i--) arr.push(addDaysISO(-i));
    return arr;
  }, [today]);

  const historyDays = useMemo(() => {
    const arr: string[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) arr.push(addDaysISO(-i));
    return arr;
  }, [today]);

  const maxIntensity = useMemo(() => {
    let max = 1;
    for (const d of gridDays) max = Math.max(max, totalFor(d));
    return max;
  }, [gridDays, eventCounts, manualCounts]);

  const hitRateDays = useMemo(() => {
    if (combinedTarget <= 0) return { hit: 0, total: historyDays.length };
    let hit = 0;
    for (const d of historyDays) if (totalFor(d) >= combinedTarget) hit++;
    return { hit, total: historyDays.length };
  }, [historyDays, eventCounts, manualCounts, combinedTarget]);

  const saveManual = async (channelId: string) => {
    if (!user?.id) return;
    const raw = manualInputs[channelId];
    const n = Number(raw);
    if (!raw || Number.isNaN(n) || n < 0) return;
    const existing = (manual ?? []).find((m: any) => m.day === today && m.channel_id === channelId);
    const nextCount = (existing?.manual_count ?? 0) + n;
    const { error } = await supabase
      .from("outreach_daily")
      .upsert(
        { day: today, user_id: user.id, channel_id: channelId, manual_count: nextCount } as never,
        { onConflict: "day,user_id,channel_id" },
      );
    if (!error) {
      setManualInputs((s) => ({ ...s, [channelId]: "" }));
      qc.invalidateQueries({ queryKey: ["outreach-daily"] });
    }
  };

  // build weeks: 12 columns x 7 rows, columns are weeks ending at latest day
  const weeks: string[][] = [];
  for (let w = 0; w < 12; w++) {
    weeks.push(gridDays.slice(w * 7, w * 7 + 7));
  }

  return (
    <AppPage module="lead" title="Outreach Tracker" perm="lead.outreach_tracker">
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <Loading />
        ) : activeChannels.length === 0 ? (
          <EmptyState title="No active channels" hint="Add channels in settings to track outreach." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeChannels.map((c: any) => {
                const sent = countFor(today, c.id);
                const target = targetFor(c.id);
                const remaining = Math.max(0, target - sent);
                const progress = target > 0 ? Math.min(100, (sent / target) * 100) : 0;
                return (
                  <Card key={c.id} title={c.name}>
                    <div className="flex items-baseline justify-between">
                      <div className="metric-number">{sent}</div>
                      <div className="label-text">/ {target || "-"} today</div>
                    </div>
                    <Progress value={progress} className="mt-2 h-1.5" />
                    <div className="label-text mt-1">
                      {target > 0 ? `${remaining} remaining` : "No target set"}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Add count"
                        className="h-8 text-[13px]"
                        value={manualInputs[c.id] ?? ""}
                        onChange={(e) => setManualInputs((s) => ({ ...s, [c.id]: e.target.value }))}
                      />
                      <Button size="sm" variant="outline" onClick={() => saveManual(c.id)}>
                        Add
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card title="Streak and history" actions={<span className="label-text">Target hit rate: {hitRateDays.total > 0 ? Math.round((hitRateDays.hit / hitRateDays.total) * 100) : 0}%</span>}>
              <TooltipProvider>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1">
                      {week.map((d) => {
                        const total = totalFor(d);
                        const opacity = total === 0 ? 0.06 : 0.15 + 0.85 * (total / maxIntensity);
                        return (
                          <Tooltip key={d}>
                            <TooltipTrigger asChild>
                              <div
                                className="size-3.5 rounded-sm bg-foreground"
                                style={{ opacity }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {dayLabel(d)}: {total} sent
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </TooltipProvider>
            </Card>

            <Card title="Last 30 days" className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="h-9 px-3 text-left font-medium text-muted-foreground">Date</th>
                      {activeChannels.map((c: any) => (
                        <th key={c.id} className="h-9 px-3 text-right font-medium text-muted-foreground">
                          {c.name}
                        </th>
                      ))}
                      <th className="h-9 px-3 text-right font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historyDays].reverse().map((d) => (
                      <tr key={d} className="h-9 border-b border-border last:border-0 hover:bg-subtle">
                        <td className="px-3">{dayLabel(d)}</td>
                        {activeChannels.map((c: any) => (
                          <td key={c.id} className="px-3 text-right tabular-nums">
                            {countFor(d, c.id)}
                          </td>
                        ))}
                        <td className="px-3 text-right font-medium tabular-nums">{totalFor(d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppPage>
  );
}
