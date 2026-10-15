// Ported from live chunk crm.dashboard-CDSAsWKm.js.
import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading, Pill, fmtDate } from "@/components/live/kit";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { useProfiles, useStages } from "@/hooks/useLookups";
import { WithHelp } from "@/components/crm/help-link";
import { useReportCurrency } from "@/components/crm/report-currency";
import { DEAL_TYPE_LABELS, dealValueLabel } from "@/components/crm/helpers";
import { REVENUE_FIELDS, dealTotal, monthKey, type EarningsDeal } from "@/components/crm/earnings";
import {
  DEFAULT_FILTERS,
  MetricPickerRow,
  RevenueBarChart,
  RevenueFilterBar,
  SmallSelect,
  applyFilters,
  useRevenueMetrics,
  useStoredState,
} from "@/components/crm/filters";

export const Route = createFileRoute("/crm/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | CRM | Tracker" },
      { name: "description", content: "Sales overview: open pipeline, money won, monthly income and win rate." },
      { property: "og:title", content: "Dashboard | CRM | Tracker" },
      {
        property: "og:description",
        content: "Sales overview: open pipeline, money won, monthly income and win rate.",
      },
    ],
  }),
  component: CrmDashboardPage,
});

type DashboardRecord = EarningsDeal & {
  id: string;
  stage_id: string | null;
  owner_id: string | null;
  created_at: string;
  estimated_value: number | null;
  contract_months: number | null;
  mrr_amount: number | null;
  deal_type: string | null;
  leads: { company_name: string; primary_contact: string | null } | null;
};

const DONUT_COLORS = ["var(--color-info)", "var(--color-positive)", "var(--color-warning)", "var(--color-negative)"];

function CrmDashboardPage() {
  const { can } = useAuth();
  can("crm.revenue");
  const { data: stages, isLoading: stagesLoading } = useStages("crm");

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ["crm_records_dashboard"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crm_records")
        .select(`id,stage_id,owner_id,created_at,${REVENUE_FIELDS},leads(company_name,primary_contact)`)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as DashboardRecord[];
    },
  });

  const stageById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);
  const rows = records ?? [];
  const fx = useReportCurrency();
  const { data: profiles } = useProfiles();
  const owners = useMemo(
    () => (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "Someone" })),
    [profiles],
  );

  const [filters, setFilters] = useStoredState("crm.filters.dashboard", DEFAULT_FILTERS);
  const [donut, setDonut] = useStoredState("crm.dash.donut", "won");
  const [chart, setChart] = useStoredState("crm.dash.chart", "last12");
  const [stageMode, setStageMode] = useStoredState("crm.dash.stages", "open");
  const [recentMode, setRecentMode] = useStoredState("crm.dash.recent", "added");

  const buckets = useMemo(() => {
    const open: DashboardRecord[] = [];
    const won: DashboardRecord[] = [];
    const lost: DashboardRecord[] = [];
    for (const r of rows) {
      const s = r.stage_id ? stageById.get(r.stage_id) : null;
      if (s?.is_won) won.push(r);
      else if (s?.is_lost) lost.push(r);
      else open.push(r);
    }
    return { open, won, lost };
  }, [rows, stageById]);

  const filtered = useMemo(() => applyFilters(buckets, filters), [buckets, filters]);
  const { metrics, overTime } = useRevenueMetrics(filtered, fx, filters);

  const donutRows = donut === "won" ? filtered.won : donut === "open" ? filtered.open : filtered.lost;
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    donutRows.forEach((r) => {
      const label = DEAL_TYPE_LABELS[r.deal_type ?? ""] ?? r.deal_type ?? "";
      map.set(label, (map.get(label) ?? 0) + dealTotal(r, fx));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [donutRows, fx]);
  const donutTotal = byType.reduce((a, b) => a + b.value, 0);
  const donutWord = donut === "won" ? "won" : donut === "open" ? "open" : "lost";

  const earned = overTime.earned;
  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) =>
      chart === "year" ? new Date(now.getFullYear(), i, 1) : new Date(now.getFullYear(), now.getMonth() - 11 + i, 1),
    ).map((d) => {
      const key = monthKey(d);
      return {
        month: key,
        label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        won: earned.get(key) ?? 0,
        value: 0,
      };
    });
  }, [earned, chart]);

  const byStage = useMemo(() => {
    const pool = stageMode === "open" ? filtered.open : [...filtered.open, ...filtered.won, ...filtered.lost];
    return (stages ?? [])
      .map((stage) => {
        const inStage = pool.filter((r) => r.stage_id === stage.id);
        const value = inStage.reduce((a, r) => a + dealTotal(r, fx), 0);
        return { stage, count: inStage.length, value };
      })
      .filter((s) => stageMode === "all" || (!s.stage.is_won && !s.stage.is_lost));
  }, [stages, filtered, fx, stageMode]);
  const maxStageValue = Math.max(1, ...byStage.map((s) => s.value));

  const recent = useMemo(
    () =>
      recentMode === "won"
        ? [...filtered.won].sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "")).slice(0, 8)
        : recentMode === "open"
          ? filtered.open.slice(0, 8)
          : [...filtered.open, ...filtered.won, ...filtered.lost]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 8),
    [filtered, recentMode],
  );

  const loading = recordsLoading || stagesLoading || !fx.ready;

  return (
    <AppPage guide="crm-dashboard" module="crm" title="Dashboard" perm="crm.records">
      <div className="flex flex-col gap-4">
        {loading ? (
          <Loading />
        ) : (
          <>
            <RevenueFilterBar value={filters} onChange={setFilters} owners={owners} />
            <MetricPickerRow
              storageKey="crm.dash.cards"
              defaults={["open", "thisMonth", "mrr", "winRate", "lost", "avgDeal"]}
              metrics={metrics}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            />
            <p className="label-text -mt-2">
              All totals in {fx.code}. Click any card's title to choose what it shows.{" "}
              <a
                href="https://tracker.infosized.co/guide#crm-dashboard"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                What do these numbers mean?
              </a>
            </p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card
                title={`Money ${donutWord} by deal type`}
                className="lg:col-span-1"
                actions={
                  <SmallSelect
                    label="Won, open or lost"
                    value={donut}
                    onChange={setDonut}
                    options={[
                      { value: "won", label: "Won" },
                      { value: "open", label: "Open" },
                      { value: "lost", label: "Lost" },
                    ]}
                  />
                }
              >
                {byType.length === 0 ? (
                  <EmptyState
                    title={`No ${donutWord} deals here`}
                    hint="Deals appear here split into one time, retainer and hybrid."
                  />
                ) : (
                  <div className="relative h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={byType}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {byType.map((d, i) => (
                            <Cell key={d.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => fx.fmt(v)} contentStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-[11px] text-muted-foreground">Total {donutWord}</div>
                      <div className="text-[18px] font-semibold">{fx.fmt(donutTotal)}</div>
                    </div>
                  </div>
                )}
                {byType.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-3 text-[12px]">
                    {byType.map((d, i) => (
                      <span key={d.name} className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        {d.name}: {fx.fmt(d.value)}
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title="Earned by month"
                className="lg:col-span-2"
                actions={
                  <SmallSelect
                    label="Which months"
                    value={chart}
                    onChange={setChart}
                    options={[
                      { value: "last12", label: "Last 12 months" },
                      { value: "year", label: `This year (${new Date().getFullYear()})` },
                    ]}
                  />
                }
              >
                <RevenueBarChart currency={fx.code} data={monthly} showExpected={false} />
              </Card>
            </div>

            <Card
              title={<WithHelp section="pipeline">Pipeline by stage</WithHelp>}
              actions={
                <SmallSelect
                  label="Which stages"
                  value={stageMode}
                  onChange={setStageMode}
                  options={[
                    { value: "open", label: "Open stages" },
                    { value: "all", label: "All stages, incl. won and lost" },
                  ]}
                />
              }
            >
              {byStage.length === 0 ? (
                <EmptyState title="No stages configured" hint="Add stages to the CRM board to see a breakdown." />
              ) : (
                <div className="flex flex-col gap-2">
                  {byStage.map(({ stage, count, value }) => (
                    <div key={stage.id} className="flex items-center gap-3">
                      <div className="w-40 shrink-0">
                        <Pill color={stage.color}>{stage.name}</Pill>
                      </div>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-subtle">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, (value / maxStageValue) * 100)}%`,
                            backgroundColor: stage.color ?? "var(--color-info)",
                          }}
                        />
                      </div>
                      <div className="w-28 shrink-0 text-right text-[12px] text-muted-foreground">
                        {count} · {fx.fmt(value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Recent records"
              actions={
                <SmallSelect
                  label="Which records"
                  value={recentMode}
                  onChange={setRecentMode}
                  options={[
                    { value: "added", label: "Newest" },
                    { value: "open", label: "Newest open" },
                    { value: "won", label: "Recently won" },
                  ]}
                />
              }
            >
              {recent.length === 0 ? (
                <EmptyState title="No CRM records yet" hint="Records appear here once a lead is marked replied." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">Company</th>
                        <th className="px-2 py-1.5 font-medium">Contact</th>
                        <th className="px-2 py-1.5 font-medium">Stage</th>
                        <th className="px-2 py-1.5 font-medium">Value</th>
                        <th className="px-2 py-1.5 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => {
                        const s = r.stage_id ? stageById.get(r.stage_id) : undefined;
                        return (
                          <tr key={r.id} className="border-b border-border hover:bg-subtle">
                            <td className="px-2 py-1.5">
                              <Link
                                to="/crm/records/$id"
                                params={{ id: r.id }}
                                className="font-medium hover:underline"
                              >
                                {r.leads?.company_name ?? "-"}
                              </Link>
                            </td>
                            <td className="px-2 py-1.5">{r.leads?.primary_contact ?? "-"}</td>
                            <td className="px-2 py-1.5">
                              <Pill color={s?.color}>{s?.name ?? "-"}</Pill>
                            </td>
                            <td className="px-2 py-1.5">{dealValueLabel(r)}</td>
                            <td className="px-2 py-1.5">{fmtDate(r.updated_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppPage>
  );
}
