// Ported from live chunk crm.revenue-CHeAOlG8.js.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading, Pill, downloadCsv, fmtDate } from "@/components/live/kit";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { useProfiles, useStages } from "@/hooks/useLookups";
import { WithHelp } from "@/components/crm/help-link";
import { useReportCurrency } from "@/components/crm/report-currency";
import { DEAL_TYPE_LABELS, dealValueLabel } from "@/components/crm/helpers";
import {
  REVENUE_FIELDS,
  byDealType,
  countByMonth,
  dealSchedule,
  monthKey,
  monthLabel,
  type EarningsDeal,
} from "@/components/crm/earnings";
import {
  DEFAULT_FILTERS,
  MetricPickerRow,
  RevenueBarChart,
  RevenueFilterBar,
  SmallSelect,
  applyFilters,
  periodRange,
  periodText,
  useRevenueMetrics,
  useStoredState,
} from "@/components/crm/filters";

export const Route = createFileRoute("/crm/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue | CRM | Tracker" },
      { name: "description", content: "Money won, money still in play, monthly income and closed deals." },
      { property: "og:title", content: "Revenue | CRM | Tracker" },
      { property: "og:description", content: "Money won, money still in play, monthly income and closed deals." },
    ],
  }),
  component: RevenuePage,
});

type RevenueRecord = EarningsDeal & {
  id: string;
  lead_id: string;
  stage_id: string | null;
  owner_id: string | null;
  estimated_value: number | null;
  mrr_amount: number | null;
  contract_months: number | null;
  deal_type: string | null;
  leads: { company_name: string } | null;
};

function RevenuePage() {
  const { can } = useAuth();
  const allowed = can("crm.revenue");
  const thisMonth = monthKey(new Date());
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [filters, setFilters] = useStoredState("crm.filters.revenue", DEFAULT_FILTERS);
  const [typeView, setTypeView] = useStoredState("crm.revenue.typeView", "money");
  const [stageSort, setStageSort] = useStoredState("crm.revenue.stageSort", "value");
  const [chartView, setChartView] = useStoredState("crm.revenue.chartView", "both");
  const [listView, setListView] = useStoredState("crm.revenue.listView", "won");
  const { data: stages } = useStages("crm");
  const { data: profiles } = useProfiles();
  const fx = useReportCurrency();

  const { data: records, isLoading } = useQuery({
    queryKey: ["crm_records_revenue"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crm_records")
        .select(`id,lead_id,stage_id,owner_id,${REVENUE_FIELDS},leads(company_name)`);
      if (error) throw error;
      return (data ?? []) as RevenueRecord[];
    },
    enabled: allowed,
  });

  const stageById = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);
  const profileById = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);
  const ownerName = (id: string | null) => {
    if (!id) return "-";
    const p = profileById.get(id);
    return p?.full_name || p?.email || "-";
  };

  const buckets = useMemo(() => {
    const open: RevenueRecord[] = [];
    const won: RevenueRecord[] = [];
    const lost: RevenueRecord[] = [];
    for (const r of records ?? []) {
      const s = r.stage_id ? stageById.get(r.stage_id) : null;
      if (s?.is_won) won.push(r);
      else if (s?.is_lost) lost.push(r);
      else open.push(r);
    }
    return { open, won, lost };
  }, [records, stageById]);

  const filtered = useMemo(() => applyFilters(buckets, filters), [buckets, filters]);
  const owners = useMemo(
    () => (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "Someone" })),
    [profiles],
  );
  const { metrics, overTime, earnedInPeriod } = useRevenueMetrics(filtered, fx, filters);
  const typeRows = useMemo(() => byDealType(filtered, fx), [filtered, fx]);
  const wonCounts = useMemo(() => countByMonth(filtered.wonAll), [filtered.wonAll]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const set = new Set([now - 1, now, now + 1]);
    for (const k of overTime.earned.keys()) set.add(Number(k.slice(0, 4)));
    for (const k of overTime.open.byMonth.keys()) set.add(Number(k.slice(0, 4)));
    return [...set].filter((y) => y >= now - 10 && y <= now + 5).sort((a, b) => b - a);
  }, [overTime]);

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map((m) => ({
        month: m,
        label: monthLabel(m, false),
        won: overTime.earned.get(m) ?? 0,
        wonCount: wonCounts.get(m) ?? 0,
        value: m >= thisMonth ? (overTime.open.byMonth.get(m) ?? 0) : 0,
        count: filtered.open.filter((r) => r.expected_close_date?.slice(0, 7) === m).length,
      })),
    [year, overTime, wonCounts, filtered.open, thisMonth],
  );

  const monthTotals = useMemo(
    () => ({
      won: months.reduce((a, m) => a + m.won, 0),
      wonCount: months.reduce((a, m) => a + m.wonCount, 0),
      value: months.reduce((a, m) => a + m.value, 0),
      count: months.reduce((a, m) => a + m.count, 0),
    }),
    [months],
  );

  const hasPeriod = periodRange(filters);
  const listRows = listView === "won" ? filtered.won : filtered.lost;

  const stageRows = useMemo(() => {
    const byStage = new Map<string, RevenueRecord[]>();
    filtered.open.forEach((r) => {
      const k = r.stage_id ?? "none";
      byStage.set(k, [...(byStage.get(k) ?? []), r]);
    });
    const now = Date.now();
    const out = (stages ?? [])
      .filter((s) => byStage.has(s.id))
      .map((s) => {
        const list = byStage.get(s.id)!;
        const totalValue = list.reduce((a, r) => a + dealSchedule(r, fx).total, 0);
        const avgDays = list.reduce((a, r) => a + (now - new Date(r.updated_at).getTime()) / 86400000, 0) / list.length;
        return { stageId: s.id, stage: s, count: list.length, totalValue, avgDays };
      });
    if (stageSort === "value") out.sort((a, b) => b.totalValue - a.totalValue);
    if (stageSort === "count") out.sort((a, b) => b.count - a.count);
    if (stageSort === "days") out.sort((a, b) => b.avgDays - a.avgDays);
    return out;
  }, [filtered.open, stages, fx, stageSort]);

  const exportCsv = () => {
    downloadCsv(`${listView}_deals.csv`, [
      ["company", "deal_type", "value", "monthly", "contract_months", `total_${fx.code}`, "closed_on", "owner"],
      ...listRows.map((r) => {
        const s = dealSchedule(r, fx);
        return [
          r.leads?.company_name ?? "",
          DEAL_TYPE_LABELS[r.deal_type ?? ""] ?? r.deal_type,
          r.estimated_value ?? 0,
          r.mrr_amount ?? 0,
          s.months || "",
          Math.round(s.total * 100) / 100,
          fmtDate(r.closed_at),
          ownerName(r.owner_id),
        ];
      }),
    ]);
  };

  if (!allowed)
    return (
      <AppPage guide="revenue" module="crm" title="Revenue" perm="crm.revenue">
        <EmptyState title="Revenue is not enabled for this account" hint="Ask an admin to give you access to Revenue." />
      </AppPage>
    );

  const loading = isLoading || !fx.ready || !stages;

  const moneyCell = (amount: number, count: number) =>
    typeView === "money" ? (
      <>
        {fx.fmt(amount)} <span className="text-muted-foreground">({count})</span>
      </>
    ) : (
      count
    );

  return (
    <AppPage guide="revenue" module="crm" title="Revenue" perm="crm.revenue">
      {loading ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-4">
          <RevenueFilterBar value={filters} onChange={setFilters} owners={owners} />
          <MetricPickerRow
            storageKey="crm.revenue.cards"
            defaults={["won", "open", "lost", "winRate", "mrr", "arr", "avgDeal", "earned"]}
            metrics={metrics}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          />
          <p className="label-text -mt-2">
            All totals in {fx.code}. Click any card's title to choose what it shows.{" "}
            <a href="https://tracker.infosized.co/guide#revenue" target="_blank" rel="noreferrer" className="underline">
              What do these numbers mean?
            </a>
          </p>

          <Card title={<WithHelp section="earnings">Money coming in</WithHelp>}>
            <div className="flex flex-col gap-3">
              <MetricPickerRow
                storageKey="crm.revenue.timeCards"
                defaults={["lastMonth", "thisMonth", "thisYear", "lastYear", "signedNext12", "couldNext12"]}
                metrics={metrics}
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
              />
              <p className="label-text">
                One-time money counts in the month the deal was won. Monthly money counts in every month of the
                contract.
              </p>
            </div>
          </Card>

          <Card
            title={<WithHelp section="deal-types">By deal type</WithHelp>}
            actions={
              <SmallSelect
                label="Show money or deal counts"
                value={typeView}
                onChange={setTypeView}
                options={[
                  { value: "money", label: "Show money" },
                  { value: "count", label: "Show deal counts" },
                ]}
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Deal type</th>
                    <th className="px-2 py-1 font-medium">Won</th>
                    <th className="px-2 py-1 font-medium">Open</th>
                    <th className="px-2 py-1 font-medium">Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {typeRows.map((t) => (
                    <tr key={t.type} className="border-b border-border">
                      <td className="px-2 py-1.5 font-medium">{DEAL_TYPE_LABELS[t.type]}</td>
                      <td className="px-2 py-1.5">{moneyCell(t.won, t.wonCount)}</td>
                      <td className="px-2 py-1.5">{moneyCell(t.open, t.openCount)}</td>
                      <td className="px-2 py-1.5">{moneyCell(t.lost, t.lostCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="label-text mt-2">
              One time: paid once. Retainer: paid every month. Hybrid: a one-time fee plus a monthly retainer.
              {typeView === "money" ? " Numbers in brackets are deal counts." : ""}
            </p>
          </Card>

          <Card
            title={<WithHelp section="revenue-by-month">Revenue by month</WithHelp>}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SmallSelect
                  label="What the chart shows"
                  value={chartView}
                  onChange={setChartView}
                  options={[
                    { value: "both", label: "Earned + could come in" },
                    { value: "earned", label: "Earned only" },
                  ]}
                />
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                  aria-label="Year"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              <RevenueBarChart currency={fx.code} data={months} showExpected={chartView === "both"} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Month</th>
                      <th className="px-2 py-1 font-medium">Earned (deals won)</th>
                      <th className="px-2 py-1 font-medium">Open deals expected to close</th>
                      <th className="px-2 py-1 font-medium">Could come in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.month} className="border-b border-border">
                        <td className="px-2 py-1.5">{m.label}</td>
                        <td className="px-2 py-1.5">
                          {m.wonCount ? `${fx.fmt(m.won)} (${m.wonCount} won)` : fx.fmt(m.won)}
                        </td>
                        <td className="px-2 py-1.5">{m.count}</td>
                        <td className="px-2 py-1.5">{fx.fmt(m.value)}</td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="px-2 py-1.5">Total {year}</td>
                      <td className="px-2 py-1.5">
                        {fx.fmt(monthTotals.won)}
                        {monthTotals.wonCount ? ` (${monthTotals.wonCount} won)` : ""}
                      </td>
                      <td className="px-2 py-1.5">{monthTotals.count}</td>
                      <td className="px-2 py-1.5">{fx.fmt(monthTotals.value)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {overTime.open.undated > 0 && (
                <p className="label-text">
                  {fx.fmt(overTime.open.undated)} of open deals has no expected close date, so it is not shown on a
                  month.
                </p>
              )}
            </div>
          </Card>

          <Card
            title={<WithHelp section="pipeline-value">Open deals by stage</WithHelp>}
            actions={
              <SmallSelect
                label="Sort stages"
                value={stageSort}
                onChange={setStageSort}
                options={[
                  { value: "value", label: "Most money first" },
                  { value: "count", label: "Most deals first" },
                  { value: "days", label: "Longest waiting first" },
                ]}
              />
            }
          >
            {stageRows.length === 0 ? (
              <EmptyState title="No open deals" hint="Open deals will appear here grouped by stage." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Stage</th>
                      <th className="px-2 py-1 font-medium">Deals</th>
                      <th className="px-2 py-1 font-medium">Total value</th>
                      <th className="px-2 py-1 font-medium">Avg days since last update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageRows.map((s) => (
                      <tr key={s.stageId} className="border-b border-border">
                        <td className="px-2 py-1.5">
                          <Pill color={s.stage.color ?? null}>{s.stage.name}</Pill>
                        </td>
                        <td className="px-2 py-1.5">{s.count}</td>
                        <td className="px-2 py-1.5">{fx.fmt(s.totalValue)}</td>
                        <td className="px-2 py-1.5">{Math.round(s.avgDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title={<WithHelp section="revenue-by-month">{listView === "won" ? "Won deals" : "Lost deals"}</WithHelp>}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SmallSelect
                  label="Won or lost deals"
                  value={listView}
                  onChange={setListView}
                  options={[
                    { value: "won", label: "Won deals" },
                    { value: "lost", label: "Lost deals" },
                  ]}
                />
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  Export CSV
                </Button>
              </div>
            }
          >
            <div className="mb-2 text-[13px]">
              <span className="font-medium">{listRows.length}</span> deal{listRows.length === 1 ? "" : "s"} {listView}
              {hasPeriod ? ` ${periodText(filters)}` : ""}
              {listView === "won" && hasPeriod ? (
                <>
                  {" · "}
                  {"earned in this period: "}
                  <span className="font-medium">{fx.fmt(earnedInPeriod)}</span>
                </>
              ) : null}
            </div>
            {listRows.length === 0 ? (
              <EmptyState
                title={listView === "won" ? "No won deals here" : "No lost deals here"}
                hint="Try another period or clear the filters."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Company</th>
                      <th className="px-2 py-1 font-medium">Deal type</th>
                      <th className="px-2 py-1 font-medium">Deal amounts</th>
                      <th className="px-2 py-1 font-medium">Total ({fx.code})</th>
                      <th className="px-2 py-1 font-medium">{listView === "won" ? "Won on" : "Lost on"}</th>
                      <th className="px-2 py-1 font-medium">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((r) => {
                      const s = dealSchedule(r, fx);
                      return (
                        <tr key={r.id} className="border-b border-border">
                          <td className="px-2 py-1.5">{r.leads?.company_name ?? "-"}</td>
                          <td className="px-2 py-1.5">{DEAL_TYPE_LABELS[r.deal_type ?? ""] ?? r.deal_type}</td>
                          <td className="px-2 py-1.5">{dealValueLabel(r)}</td>
                          <td className="px-2 py-1.5 font-medium">{fx.fmt(s.total)}</td>
                          <td className="px-2 py-1.5">{fmtDate(r.closed_at)}</td>
                          <td className="px-2 py-1.5">{ownerName(r.owner_id)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </AppPage>
  );
}
