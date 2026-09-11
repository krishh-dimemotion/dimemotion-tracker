import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading, Metric, Pill } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles, useStages } from "@/hooks/useLookups";
import { money, fmtDate, downloadCsv, todayISO } from "@/lib/format";
import { DEAL_TYPE_LABELS } from "@/components/crm/helpers";
import { MonthlyRevenueChart } from "@/components/crm/revenue/MonthlyRevenueChart";
import type { RevenueSummary } from "@/components/crm/revenue/types";

export const Route = createFileRoute("/crm/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue | CRM | Buzzspear Tracker" },
      { name: "description", content: "Pipeline value, MRR, expected revenue and closed deals." },
      { property: "og:title", content: "Revenue | CRM | Buzzspear Tracker" },
      { property: "og:description", content: "Pipeline value, MRR, expected revenue and closed deals." },
    ],
  }),
  component: RevenuePage,
});

type CrmRecordFull = {
  id: string;
  lead_id: string;
  stage_id: string | null;
  estimated_value: number | null;
  currency: string;
  deal_type: string;
  mrr_amount: number | null;
  probability: number | null;
  expected_close_date: string | null;
  closed_at: string | null;
  owner_id: string | null;
  updated_at: string;
  leads: { company_name: string } | null;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function RevenuePage() {
  const [weighted, setWeighted] = useState(false);
  const { data: stages } = useStages("crm");
  const { data: profiles } = useProfiles();

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ["revenue_summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("revenue_summary");
      if (error) throw error;
      return (data?.[0] ?? null) as RevenueSummary | null;
    },
    retry: false,
  });

  const permissionDenied =
    !!summaryError &&
    /permission|denied|not authorized|policy/i.test((summaryError as any)?.message ?? "");

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ["crm_records_revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_records")
        .select(
          "id,lead_id,stage_id,estimated_value,currency,deal_type,mrr_amount,probability,expected_close_date,closed_at,owner_id,updated_at,leads(company_name)",
        );
      if (error) throw error;
      return (data ?? []) as unknown as CrmRecordFull[];
    },
    enabled: !permissionDenied,
  });

  const stageMap = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);
  const profileMap = useMemo(() => new Map((profiles ?? []).map((p: any) => [p.id, p])), [profiles]);
  const ownerName = (id: string | null) => {
    if (!id) return "-";
    const p = profileMap.get(id);
    return p?.full_name || p?.email || "-";
  };

  const openRecords = useMemo(
    () => (records ?? []).filter((r) => {
      const s = r.stage_id ? stageMap.get(r.stage_id) : null;
      return s && !s.is_won && !s.is_lost;
    }),
    [records, stageMap],
  );

  const wonRecords = useMemo(
    () => (records ?? []).filter((r) => {
      const s = r.stage_id ? stageMap.get(r.stage_id) : null;
      return s?.is_won;
    }),
    [records, stageMap],
  );

  const monthlyData = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) });
    }
    return months.map(({ key, label }) => {
      const rows = openRecords.filter((r) => r.expected_close_date && r.expected_close_date.slice(0, 7) === key);
      const value = rows.reduce((sum, r) => sum + Number(r.estimated_value ?? 0), 0);
      const w = rows.reduce((sum, r) => sum + Number(r.estimated_value ?? 0) * (Number(r.probability ?? 0) / 100), 0);
      return { month: key, label, value, weighted: w, count: rows.length };
    });
  }, [openRecords]);

  const pipelineByStage = useMemo(() => {
    const groups = new Map<string, CrmRecordFull[]>();
    openRecords.forEach((r) => {
      const key = r.stage_id ?? "none";
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    });
    const now = Date.now();
    return Array.from(groups.entries()).map(([stageId, rows]) => {
      const stage = stageMap.get(stageId);
      const totalValue = rows.reduce((s, r) => s + Number(r.estimated_value ?? 0), 0);
      const weightedValue = rows.reduce(
        (s, r) => s + Number(r.estimated_value ?? 0) * (Number(r.probability ?? 0) / 100),
        0,
      );
      const avgDays =
        rows.reduce((s, r) => s + (now - new Date(r.updated_at).getTime()) / 86400000, 0) / rows.length;
      return { stageId, stage, count: rows.length, totalValue, weightedValue, avgDays };
    }).sort((a, b) => (a.stage?.color ? 0 : 1));
  }, [openRecords, stageMap]);

  const exportClosed = () => {
    downloadCsv("closed_deals.csv", [
      ["company", "value", "deal_type", "mrr", "close_date", "owner"],
      ...wonRecords.map((r) => [
        r.leads?.company_name ?? "",
        r.estimated_value ?? 0,
        DEAL_TYPE_LABELS[r.deal_type] ?? r.deal_type,
        r.mrr_amount ?? 0,
        fmtDate(r.closed_at ?? r.expected_close_date),
        ownerName(r.owner_id),
      ]),
    ]);
  };

  if (permissionDenied) {
    return (
      <AppPage module="crm" title="Revenue" perm="crm.revenue">
        <EmptyState
          title="Revenue is not enabled for this account"
          hint="Ask an admin to grant the crm.revenue permission to see pipeline value, MRR and closed deal reporting."
        />
      </AppPage>
    );
  }

  const expectedArr = (summary?.current_mrr ?? 0) * 12;
  const potentialArr = ((summary?.current_mrr ?? 0) + (summary?.open_retainer_mrr ?? 0)) * 12;
  const wonCount = summary?.won_count ?? 0;
  const lostCount = summary?.lost_count ?? 0;
  const winRateHasData = wonCount + lostCount > 0;
  const winRate = winRateHasData ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;

  return (
    <AppPage module="crm" title="Revenue" perm="crm.revenue">
      <div className="flex flex-col gap-4">
        {summaryLoading ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Pipeline value" value={money(summary?.pipeline_value)} />
            <Metric label="Weighted pipeline" value={money(summary?.weighted_pipeline)} />
            <Metric label="Won this month" value={money(summary?.won_this_month)} tone="positive" />
            <Metric label="Revenue not won" value={money(summary?.lost_value)} tone="negative" />
            <Metric label="Current MRR" value={money(summary?.current_mrr)} tone="info" />
            <Metric label="Expected ARR" value={money(expectedArr)} />
            <Metric label="Potential ARR" value={money(potentialArr)} tone="info" />
            <Metric label="Average deal size" value={money(summary?.avg_deal_size)} />
            <Metric
              label="Win rate"
              value={winRateHasData ? `${winRate}%` : "0%"}
              helper={winRateHasData ? "" : "No data yet"}
              {...(winRateHasData ? { tone: "positive" as const } : {})}
            />
          </div>
        )}

        <Card
          title="Expected revenue by month"
          actions={
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                className={`rounded px-2 py-1 text-[12px] ${!weighted ? "bg-subtle font-medium" : "text-muted-foreground"}`}
                onClick={() => setWeighted(false)}
              >
                Unweighted
              </button>
              <button
                className={`rounded px-2 py-1 text-[12px] ${weighted ? "bg-subtle font-medium" : "text-muted-foreground"}`}
                onClick={() => setWeighted(true)}
              >
                Weighted
              </button>
            </div>
          }
        >
          {recordsLoading ? (
            <Loading />
          ) : (
            <div className="flex flex-col gap-3">
              <MonthlyRevenueChart data={monthlyData} weighted={weighted} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Month</th>
                      <th className="px-2 py-1 font-medium"># Deals</th>
                      <th className="px-2 py-1 font-medium">Value</th>
                      <th className="px-2 py-1 font-medium">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((m) => (
                      <tr key={m.month} className="border-b border-border">
                        <td className="px-2 py-1.5">{m.label}</td>
                        <td className="px-2 py-1.5">{m.count}</td>
                        <td className="px-2 py-1.5">{money(m.value)}</td>
                        <td className="px-2 py-1.5">{money(m.weighted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        <Card title="Deal pipeline breakdown">
          {recordsLoading ? (
            <Loading />
          ) : pipelineByStage.length === 0 ? (
            <EmptyState title="No open deals" hint="Open CRM records will appear here grouped by stage." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Stage</th>
                    <th className="px-2 py-1 font-medium">Count</th>
                    <th className="px-2 py-1 font-medium">Total value</th>
                    <th className="px-2 py-1 font-medium">Weighted value</th>
                    <th className="px-2 py-1 font-medium">Avg days in stage</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineByStage.map((row) => (
                    <tr key={row.stageId} className="border-b border-border">
                      <td className="px-2 py-1.5">
                        <Pill color={row.stage?.color ?? null}>{row.stage?.name ?? "No stage"}</Pill>
                      </td>
                      <td className="px-2 py-1.5">{row.count}</td>
                      <td className="px-2 py-1.5">{money(row.totalValue)}</td>
                      <td className="px-2 py-1.5">{money(row.weightedValue)}</td>
                      <td className="px-2 py-1.5">{Math.round(row.avgDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Closed deals" actions={<Button size="sm" variant="outline" onClick={exportClosed}>Export CSV</Button>}>
          {recordsLoading ? (
            <Loading />
          ) : wonRecords.length === 0 ? (
            <EmptyState title="No closed deals yet" hint="Deals marked as won will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Company</th>
                    <th className="px-2 py-1 font-medium">Value</th>
                    <th className="px-2 py-1 font-medium">Deal type</th>
                    <th className="px-2 py-1 font-medium">MRR</th>
                    <th className="px-2 py-1 font-medium">Close date</th>
                    <th className="px-2 py-1 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {wonRecords.map((r) => (
                    <tr key={r.id} className="border-b border-border">
                      <td className="px-2 py-1.5">{r.leads?.company_name ?? "-"}</td>
                      <td className="px-2 py-1.5">{money(r.estimated_value, r.currency)}</td>
                      <td className="px-2 py-1.5">{DEAL_TYPE_LABELS[r.deal_type] ?? r.deal_type}</td>
                      <td className="px-2 py-1.5">{r.mrr_amount ? money(r.mrr_amount, r.currency) : "-"}</td>
                      <td className="px-2 py-1.5">{fmtDate(r.closed_at ?? r.expected_close_date)}</td>
                      <td className="px-2 py-1.5">{ownerName(r.owner_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppPage>
  );
}
