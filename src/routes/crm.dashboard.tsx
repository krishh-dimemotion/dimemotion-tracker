import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading, Metric, Pill } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useStages } from "@/hooks/useLookups";
import { money, fmtDate } from "@/lib/format";
import { DEAL_TYPE_LABELS } from "@/components/crm/helpers";
import { MonthlyRevenueChart } from "@/components/crm/revenue/MonthlyRevenueChart";
import type { RevenueSummary } from "@/components/crm/revenue/types";

export const Route = createFileRoute("/crm/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | CRM | Buzzspear Tracker" },
      {
        name: "description",
        content: "Sales pipeline overview: open value, weighted pipeline, closed revenue, MRR and win rate.",
      },
      { property: "og:title", content: "Dashboard | CRM | Buzzspear Tracker" },
      {
        property: "og:description",
        content: "Sales pipeline overview: open value, weighted pipeline, closed revenue, MRR and win rate.",
      },
    ],
  }),
  component: CrmDashboardPage,
});

type DashboardRecord = {
  id: string;
  stage_id: string | null;
  estimated_value: number | null;
  currency: string;
  deal_type: string;
  mrr_amount: number | null;
  probability: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  leads: { company_name: string; primary_contact: string | null } | null;
};

const DONUT_COLORS = ["var(--color-info)", "var(--color-positive)", "var(--color-warning)", "var(--color-negative)"];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function CrmDashboardPage() {
  const { can } = useAuth();
  const canRevenue = can("crm.revenue");
  const { data: stages, isLoading: stagesLoading } = useStages("crm");

  const { data: summary } = useQuery({
    queryKey: ["revenue_summary_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("revenue_summary");
      if (error) throw error;
      return (data?.[0] ?? null) as RevenueSummary | null;
    },
    enabled: canRevenue,
    retry: false,
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ["crm_records_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_records")
        .select(
          "id,stage_id,estimated_value,currency,deal_type,mrr_amount,probability,closed_at,created_at,updated_at,leads(company_name,primary_contact)",
        )
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as DashboardRecord[];
    },
  });

  const stageMap = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);

  const rows = records ?? [];

  const openRows = useMemo(
    () => rows.filter((r) => {
      const s = r.stage_id ? stageMap.get(r.stage_id) : null;
      return !s || (!s.is_won && !s.is_lost);
    }),
    [rows, stageMap],
  );
  const wonRows = useMemo(
    () => rows.filter((r) => (r.stage_id ? stageMap.get(r.stage_id)?.is_won : false)),
    [rows, stageMap],
  );
  const lostRows = useMemo(
    () => rows.filter((r) => (r.stage_id ? stageMap.get(r.stage_id)?.is_lost : false)),
    [rows, stageMap],
  );

  const fallback = useMemo(() => {
    const now = new Date();
    const openPipelineValue = openRows.reduce((s, r) => s + Number(r.estimated_value ?? 0), 0);
    const weightedPipeline = openRows.reduce(
      (s, r) => s + Number(r.estimated_value ?? 0) * (Number(r.probability ?? 0) / 100),
      0,
    );
    const closedThisMonth = wonRows.filter((r) => (r.closed_at ?? "").slice(0, 7) === monthKey(now));
    const closedRevenueThisMonth = closedThisMonth.reduce((s, r) => s + Number(r.estimated_value ?? 0), 0);
    const closedMrr = wonRows.reduce((s, r) => s + Number(r.mrr_amount ?? 0), 0);
    const wonCount = wonRows.length;
    const lostCount = lostRows.length;
    const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
    const avgDealSize = wonCount > 0 ? wonRows.reduce((s, r) => s + Number(r.estimated_value ?? 0), 0) / wonCount : 0;
    return {
      openPipelineValue,
      weightedPipeline,
      closedRevenueThisMonth,
      closedMrr,
      winRate,
      winRateHasData: wonCount + lostCount > 0,
      avgDealSize,
    };
  }, [openRows, wonRows, lostRows]);

  const metrics = canRevenue && summary
    ? {
        openPipelineValue: summary.pipeline_value,
        weightedPipeline: summary.weighted_pipeline,
        closedRevenueThisMonth: summary.won_this_month,
        closedMrr: summary.current_mrr,
        winRate: summary.won_count + summary.lost_count > 0
          ? Math.round((summary.won_count / (summary.won_count + summary.lost_count)) * 100)
          : 0,
        winRateHasData: summary.won_count + summary.lost_count > 0,
        avgDealSize: summary.avg_deal_size,
      }
    : fallback;

  const donutData = useMemo(() => {
    const groups = new Map<string, number>();
    wonRows.forEach((r) => {
      const key = DEAL_TYPE_LABELS[r.deal_type] ?? r.deal_type;
      groups.set(key, (groups.get(key) ?? 0) + Number(r.mrr_amount ?? 0));
    });
    return Array.from(groups.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [wonRows]);
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  const monthlyClosed = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) });
    }
    return months.map(({ key, label }) => {
      const monthRows = wonRows.filter((r) => (r.closed_at ?? "").slice(0, 7) === key);
      const value = monthRows.reduce((s, r) => s + Number(r.estimated_value ?? 0), 0);
      return { month: key, label, value, weighted: value };
    });
  }, [wonRows]);

  const stageBreakdown = useMemo(() => {
    return (stages ?? []).map((s) => {
      const stageRows = rows.filter((r) => r.stage_id === s.id);
      const value = stageRows.reduce((sum, r) => sum + Number(r.estimated_value ?? 0), 0);
      return { stage: s, count: stageRows.length, value };
    });
  }, [stages, rows]);
  const maxStageValue = Math.max(1, ...stageBreakdown.map((s) => s.value));

  const recent = rows.slice(0, 8);

  const isLoading = recordsLoading || stagesLoading;

  return (
    <AppPage module="crm" title="Dashboard" perm="crm.records">
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Open pipeline value" value={money(metrics.openPipelineValue)} />
              <Metric label="Weighted pipeline" value={money(metrics.weightedPipeline)} tone="info" />
              <Metric label="Closed revenue this month" value={money(metrics.closedRevenueThisMonth)} tone="positive" />
              <Metric label="Closed MRR" value={money(metrics.closedMrr)} tone="positive" />
              <Metric
                label="Win rate"
                value={metrics.winRateHasData ? `${metrics.winRate}%` : "0%"}
                helper={metrics.winRateHasData ? "" : "No data yet"}
              />
              <Metric label="Average deal size" value={money(metrics.avgDealSize)} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="Closed MRR by deal type" className="lg:col-span-1">
                {donutData.length === 0 ? (
                  <EmptyState title="No closed MRR yet" hint="Closed retainer deals will appear here." />
                ) : (
                  <div className="relative h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {donutData.map((d, i) => (
                            <Cell key={d.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-[11px] text-muted-foreground">Total MRR</div>
                      <div className="text-[18px] font-semibold">{money(donutTotal)}</div>
                    </div>
                  </div>
                )}
                {donutData.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-3 text-[12px]">
                    {donutData.map((d, i) => (
                      <span key={d.name} className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        {d.name}: {money(d.value)}
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Closed revenue by month (last 12 months)" className="lg:col-span-2">
                <MonthlyRevenueChart data={monthlyClosed} weighted={false} />
              </Card>
            </div>

            <Card title="Pipeline by stage">
              {stageBreakdown.length === 0 ? (
                <EmptyState title="No stages configured" hint="Add stages to the CRM board to see a breakdown." />
              ) : (
                <div className="flex flex-col gap-2">
                  {stageBreakdown.map(({ stage, count, value }) => (
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
                        {count} · {money(value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Recent records">
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
                        const stage = r.stage_id ? stageMap.get(r.stage_id) : undefined;
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
                              <Pill color={stage?.color}>{stage?.name ?? "-"}</Pill>
                            </td>
                            <td className="px-2 py-1.5">{money(r.estimated_value, r.currency)}</td>
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
