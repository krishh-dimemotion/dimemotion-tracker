// Ported from live chunk filters-Bl69fE12.js. Revenue filter bar, metric pickers and the revenue bar chart.
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, money } from "@/components/live/kit";
import { HelpLink } from "@/components/crm/help-link";
import { DEAL_TYPE_LABELS } from "@/components/crm/helpers";
import {
  addMonths,
  closeMonth,
  monthKey,
  monthLabel,
  revenueStats,
  sumRange,
  type EarningsDeal,
  type ValueFns,
} from "@/components/crm/earnings";

export type RevenueBarDatum = { label: string; won: number; value?: number };

export function RevenueBarChart({
  data,
  showExpected = true,
  currency = "USD",
}: {
  data: RevenueBarDatum[];
  showExpected?: boolean;
  currency?: string;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => money(v, currency).replace(/\.00$/, "")} />
          <Tooltip formatter={(v: number) => money(v, currency)} contentStyle={{ fontSize: 12 }} />
          {showExpected && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Bar
            dataKey="won"
            name="Won"
            stackId="rev"
            fill="var(--color-success, #16a34a)"
            radius={showExpected ? undefined : [3, 3, 0, 0]}
          />
          {showExpected && (
            <Bar
              dataKey="value"
              name="Could come in (open deals)"
              stackId="rev"
              fill="var(--color-info, #3b82f6)"
              radius={[3, 3, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setValue(readStored(key, { v: initial }).v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [
    value,
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify({ v }));
      } catch {
        /* ignore */
      }
    },
  ];
}

export type Period = "all" | "this_month" | "last_month" | "this_year" | "last_year" | "month";
export type RevenueFilters = { period: Period; month: string; dealType: string; owner: string };

export const DEFAULT_FILTERS: RevenueFilters = {
  period: "all",
  month: monthKey(new Date()),
  dealType: "all",
  owner: "all",
};

export const PERIOD_LABELS: Record<Period, string> = {
  all: "All time",
  this_month: "This month",
  last_month: "Last month",
  this_year: "This year",
  last_year: "Last year",
  month: "Pick a month",
};

export function periodRange(f: RevenueFilters, now = monthKey(new Date())): [string, string] | null {
  const year = now.slice(0, 4);
  const prev = String(Number(year) - 1);
  switch (f.period) {
    case "this_month":
      return [now, now];
    case "last_month": {
      const m = addMonths(now, -1);
      return [m, m];
    }
    case "this_year":
      return [`${year}-01`, `${year}-12`];
    case "last_year":
      return [`${prev}-01`, `${prev}-12`];
    case "month":
      return [f.month, f.month];
    default:
      return null;
  }
}

export function periodText(f: RevenueFilters) {
  return f.period === "month" ? monthLabel(f.month) : PERIOD_LABELS[f.period].toLowerCase();
}

type Filterable = EarningsDeal & { owner_id?: string | null };

export function applyFilters<T extends Filterable>(b: { open: T[]; won: T[]; lost: T[] }, f: RevenueFilters) {
  const range = periodRange(f);
  const match = (d: T) =>
    (f.dealType === "all" || (d.deal_type ?? "one_time") === f.dealType) &&
    (f.owner === "all" || (f.owner === "none" ? !d.owner_id : d.owner_id === f.owner));
  const inRange = (d: T) => {
    if (!range) return true;
    const m = closeMonth(d);
    return m >= range[0] && m <= range[1];
  };
  const won = b.won.filter(match);
  const lost = b.lost.filter(match);
  return { open: b.open.filter(match), won: won.filter(inRange), lost: lost.filter(inRange), wonAll: won, lostAll: lost };
}


const SELECT_CLASS = "h-8 rounded-md border border-border bg-background px-2 text-[12px]";

export function RevenueFilterBar({
  value,
  onChange,
  owners,
}: {
  value: RevenueFilters;
  onChange: (v: RevenueFilters) => void;
  owners: { id: string; name: string }[];
}) {
  const set = (patch: Partial<RevenueFilters>) => onChange({ ...value, ...patch });
  const active = value.period !== "all" || value.dealType !== "all" || value.owner !== "all";
  return (
    <div className="flex flex-wrap items-center gap-2 pro-card px-3 py-2">
      <span className="flex items-center text-[12px] font-medium text-muted-foreground">
        Filter <HelpLink section="crm-filters" label="How filters and card dropdowns work" />
      </span>
      <select
        className={SELECT_CLASS}
        aria-label="Period"
        value={value.period}
        onChange={(e) => set({ period: e.target.value as Period })}
      >
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABELS[p]}
          </option>
        ))}
      </select>
      {value.period === "month" && (
        <input
          type="month"
          className={SELECT_CLASS}
          value={value.month}
          onChange={(e) => e.target.value && set({ month: e.target.value })}
        />
      )}
      <select
        className={SELECT_CLASS}
        aria-label="Deal type"
        value={value.dealType}
        onChange={(e) => set({ dealType: e.target.value })}
      >
        <option value="all">All deal types</option>
        {Object.entries(DEAL_TYPE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {owners.length > 1 && (
        <select
          className={SELECT_CLASS}
          aria-label="Owner"
          value={value.owner}
          onChange={(e) => set({ owner: e.target.value })}
        >
          <option value="all">Everyone</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="none">No owner</option>
        </select>
      )}
      {active && (
        <button
          className="text-[12px] text-muted-foreground underline hover:text-foreground"
          onClick={() => onChange({ ...DEFAULT_FILTERS })}
        >
          Clear
        </button>
      )}
      {value.period !== "all" && (
        <span className="text-[11px] text-muted-foreground">
          Won and lost deals: {periodText(value)}. Open deals are always shown.
        </span>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export type MetricTone = "positive" | "negative" | "info";
export type MetricDef = { label: string; value: string; helper?: string; tone?: MetricTone };
export type MetricKey =
  | "won"
  | "open"
  | "lost"
  | "winRate"
  | "mrr"
  | "arr"
  | "avgDeal"
  | "earned"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "signedNext12"
  | "couldNext12"
  | "wonCount"
  | "openCount"
  | "lostCount";

export function useRevenueMetrics<T extends Filterable>(
  filtered: { open: T[]; won: T[]; lost: T[]; wonAll: T[]; lostAll: T[] },
  fx: ValueFns<T> & { fmt: (n: number) => string },
  filters: RevenueFilters,
) {
  return useMemo(() => {
    const now = monthKey(new Date());
    const numbers = revenueStats(filtered, fx, now);
    const overTime = revenueStats({ open: filtered.open, won: filtered.wonAll, lost: filtered.lostAll }, fx, now);
    const range = periodRange(filters, now);
    const text = periodText(filters);
    const earnedInPeriod = range
      ? sumRange(overTime.earned, range[0], range[1])
      : [...overTime.earned.values()].reduce((a, b) => a + b, 0);
    const p = filters.period === "all" ? "all time" : text;
    const metrics: Record<MetricKey, MetricDef> = {
      won: {
        label: `Won (${p})`,
        value: fx.fmt(numbers.wonTotal),
        helper: plural(numbers.wonCount, "deal") + " won",
        tone: "positive",
      },
      open: {
        label: "Open pipeline",
        value: fx.fmt(numbers.openTotal),
        helper: plural(numbers.openCount, "open deal") + " still to close",
        tone: "info",
      },
      lost: {
        label: `Lost (${p})`,
        value: fx.fmt(numbers.lostTotal),
        helper: plural(numbers.lostCount, "deal") + " lost",
        tone: "negative",
      },
      winRate: {
        label: `Win rate (${p})`,
        value: numbers.winRate === null ? "-" : `${numbers.winRate}%`,
        helper:
          numbers.winRate === null ? "No won or lost deals yet" : `${numbers.wonCount} won, ${numbers.lostCount} lost`,
      },
      mrr: {
        label: "Monthly income (MRR)",
        value: fx.fmt(overTime.mrr),
        helper: `From ${plural(overTime.mrrCount, "active retainer")}`,
        tone: "positive",
      },
      arr: { label: "Yearly income (ARR)", value: fx.fmt(overTime.arr), helper: "Monthly income x 12" },
      avgDeal: { label: `Average deal size (${p})`, value: fx.fmt(numbers.avgDeal), helper: "Won total ÷ deals won" },
      earned: {
        label: `Earned (${p})`,
        value: fx.fmt(earnedInPeriod),
        helper: "Money that came in, retainers month by month",
        tone: "positive",
      },
      thisMonth: {
        label: `This month (${monthLabel(now, false)})`,
        value: fx.fmt(overTime.thisMonthEarned),
        helper: "Earned",
        tone: "positive",
      },
      lastMonth: {
        label: `Last month (${monthLabel(addMonths(now, -1), false)})`,
        value: fx.fmt(overTime.lastMonth),
        helper: "Earned",
      },
      thisYear: {
        label: `This year so far (${now.slice(0, 4)})`,
        value: fx.fmt(overTime.thisYear),
        helper: "Earned",
        tone: "positive",
      },
      lastYear: { label: `Last year (${Number(now.slice(0, 4)) - 1})`, value: fx.fmt(overTime.lastYear), helper: "Earned" },
      signedNext12: {
        label: "Next 12 months, already signed",
        value: fx.fmt(overTime.signedNext12),
        helper: "Retainers you have already won",
        tone: "info",
      },
      couldNext12: {
        label: "Next 12 months, if open deals close",
        value: fx.fmt(overTime.couldNext12),
        helper: "Signed + every open deal",
        tone: "info",
      },
      wonCount: { label: `Deals won (${p})`, value: String(numbers.wonCount), tone: "positive" },
      openCount: { label: "Open deals", value: String(numbers.openCount), tone: "info" },
      lostCount: { label: `Deals lost (${p})`, value: String(numbers.lostCount), tone: "negative" },
    };
    return { metrics, numbers, overTime, earnedInPeriod };
  }, [filtered, fx, filters]);
}

const METRIC_GROUPS: { group: string; keys: MetricKey[] }[] = [
  { group: "Totals", keys: ["won", "open", "lost", "earned", "avgDeal"] },
  { group: "Win and loss", keys: ["winRate", "wonCount", "lostCount", "openCount"] },
  { group: "Recurring", keys: ["mrr", "arr"] },
  { group: "By time", keys: ["thisMonth", "lastMonth", "thisYear", "lastYear", "signedNext12", "couldNext12"] },
];

const METRIC_OPTION_LABELS: Record<MetricKey, string> = {
  won: "Won",
  open: "Open pipeline",
  lost: "Lost",
  earned: "Earned in period",
  avgDeal: "Average deal size",
  winRate: "Win rate",
  wonCount: "Deals won",
  lostCount: "Deals lost",
  openCount: "Open deals",
  mrr: "Monthly income (MRR)",
  arr: "Yearly income (ARR)",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisYear: "This year so far",
  lastYear: "Last year",
  signedNext12: "Next 12 months, signed",
  couldNext12: "Next 12 months, if open deals close",
};

const TONE_CLASS: Record<MetricTone, string> = {
  positive: "text-positive",
  negative: "text-negative",
  info: "text-info",
};

function MetricPickerCard({
  metrics,
  value,
  onChange,
}: {
  metrics: Record<string, MetricDef>;
  value: string;
  onChange: (v: string) => void;
}) {
  const m = metrics[value] ?? metrics.won;
  return (
    <Card>
      <label className="relative flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
        <span className="label-text truncate">{m.label}</span>
        <ChevronDown className="size-3 shrink-0" />
        <select
          aria-label="Choose what this card shows"
          title="Choose what this card shows"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {METRIC_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.keys.map((k) => (
                <option key={k} value={k}>
                  {METRIC_OPTION_LABELS[k]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className={cn("metric-number mt-1", m.tone ? TONE_CLASS[m.tone] : "")}>{m.value}</div>
      {m.helper && <div className="label-text mt-1">{m.helper}</div>}
    </Card>
  );
}

export function MetricPickerRow({
  storageKey,
  defaults,
  metrics,
  className,
}: {
  storageKey: string;
  defaults: MetricKey[];
  metrics: Record<string, MetricDef>;
  className?: string;
}) {
  const [stored, setStored] = useStoredState<string[]>(storageKey, defaults);
  const keys = defaults.map((d, i) => (stored[i] && stored[i] in metrics ? stored[i] : d));
  return (
    <div className={className}>
      {keys.map((k, i) => (
        <MetricPickerCard
          key={i}
          metrics={metrics}
          value={k}
          onChange={(v) => setStored(keys.map((old, j) => (j === i ? v : old)))}
        />
      ))}
    </div>
  );
}

export function SmallSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select className={SELECT_CLASS} aria-label={label} title={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
