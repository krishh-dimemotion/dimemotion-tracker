// Ported from live chunk earnings-CTLKlnEc.js. Revenue maths shared by the CRM pages.

export const REVENUE_FIELDS =
  "estimated_value,currency,usd_value_at_close,usd_mrr_at_close,usd_value_manual,received_amount,received_currency,deal_type,mrr_amount,contract_months,expected_close_date,closed_at,updated_at";

export type EarningsDeal = {
  estimated_value?: number | null;
  currency?: string | null;
  usd_value_at_close?: number | null;
  usd_mrr_at_close?: number | null;
  usd_value_manual?: boolean | null;
  received_amount?: number | null;
  received_currency?: string | null;
  deal_type?: string | null;
  mrr_amount?: number | null;
  contract_months?: number | null;
  expected_close_date?: string | null;
  closed_at?: string | null;
  updated_at: string;
};

/** Converts a deal into display currency amounts. */
export type ValueFns<T = EarningsDeal> = {
  value: (d: T) => number;
  mrr: (d: T) => number;
};

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function addMonths(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

export function monthLabel(key: string, withYear = true) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(
    undefined,
    withYear ? { month: "short", year: "numeric" } : { month: "short" },
  );
}

export function dealSchedule<T extends EarningsDeal>(d: T, fx: ValueFns<T>) {
  const value = fx.value(d);
  const type = d.deal_type ?? "one_time";
  const monthly = type === "retainer" || type === "hybrid" ? fx.mrr(d) : 0;
  const contract = d.contract_months && d.contract_months > 0 ? Math.min(120, d.contract_months) : 0;
  if (!(monthly > 0)) return { oneTime: value, monthly: 0, months: 0, total: value };
  if (type === "hybrid") {
    const months = contract || 12;
    return { oneTime: value, monthly, months, total: value + monthly * months };
  }
  const months = contract || (value > 0 ? Math.max(1, Math.min(120, Math.round(value / monthly))) : 12);
  const perMonth = d.usd_value_manual && value > 0 ? value / months : monthly;
  return { oneTime: 0, monthly: perMonth, months, total: perMonth * months };
}

export const dealTotal = <T extends EarningsDeal>(d: T, fx: ValueFns<T>) => dealSchedule(d, fx).total;

export const closeMonth = (d: EarningsDeal) => (d.closed_at ?? d.updated_at).slice(0, 7);

function spread<T extends EarningsDeal>(d: T, start: string, fx: ValueFns<T>, map: Map<string, number>) {
  const s = dealSchedule(d, fx);
  if (s.oneTime) map.set(start, (map.get(start) ?? 0) + s.oneTime);
  for (let i = 0; i < s.months; i++) {
    const k = addMonths(start, i);
    map.set(k, (map.get(k) ?? 0) + s.monthly);
  }
}

export function earnedByMonth<T extends EarningsDeal>(deals: T[], fx: ValueFns<T>) {
  const map = new Map<string, number>();
  for (const d of deals) spread(d, closeMonth(d), fx, map);
  return map;
}

export function countByMonth(deals: EarningsDeal[]) {
  const map = new Map<string, number>();
  for (const d of deals) {
    const k = closeMonth(d);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export function forecastOpen<T extends EarningsDeal>(deals: T[], fx: ValueFns<T>) {
  const byMonth = new Map<string, number>();
  let undated = 0;
  for (const d of deals) {
    if (d.expected_close_date) spread(d, d.expected_close_date.slice(0, 7), fx, byMonth);
    else undated += dealTotal(d, fx);
  }
  return { byMonth, undated };
}

function mrrAt<T extends EarningsDeal>(deals: T[], fx: ValueFns<T>, month: string) {
  let total = 0;
  let count = 0;
  for (const d of deals) {
    const s = dealSchedule(d, fx);
    if (!s.monthly) continue;
    const start = closeMonth(d);
    if (start <= month && month < addMonths(start, s.months)) {
      total += s.monthly;
      count += 1;
    }
  }
  return { total, count };
}

export function sumRange(map: Map<string, number>, from: string, to: string) {
  let total = 0;
  for (const [k, v] of map) if (k >= from && k <= to) total += v;
  return total;
}

export type DealBuckets<T> = { won: T[]; open: T[]; lost: T[] };

export function revenueStats<T extends EarningsDeal>(b: DealBuckets<T>, fx: ValueFns<T>, month: string) {
  const sum = (list: T[]) => list.reduce((acc, d) => acc + dealTotal(d, fx), 0);
  const earned = earnedByMonth(b.won, fx);
  const open = forecastOpen(b.open, fx);
  const wonTotal = sum(b.won);
  const decided = b.won.length + b.lost.length;
  const mrr = mrrAt(b.won, fx, month);
  const next1 = addMonths(month, 1);
  const next12 = addMonths(month, 12);
  const year = month.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const signedNext12 = sumRange(earned, next1, next12);
  return {
    earned,
    open,
    openTotal: sum(b.open),
    openCount: b.open.length,
    wonTotal,
    wonCount: b.won.length,
    lostTotal: sum(b.lost),
    lostCount: b.lost.length,
    winRate: decided ? Math.round((b.won.length / decided) * 100) : null,
    avgDeal: b.won.length ? wonTotal / b.won.length : 0,
    mrr: mrr.total,
    mrrCount: mrr.count,
    arr: mrr.total * 12,
    lastMonth: earned.get(addMonths(month, -1)) ?? 0,
    thisMonthEarned: earned.get(month) ?? 0,
    thisYear: sumRange(earned, `${year}-01`, month),
    lastYear: sumRange(earned, `${prevYear}-01`, `${prevYear}-12`),
    signedNext12,
    couldNext12: signedNext12 + sumRange(open.byMonth, month, next12) + open.undated,
  };
}

export type RevenueStats = ReturnType<typeof revenueStats>;

export function byDealType<T extends EarningsDeal>(b: DealBuckets<T>, fx: ValueFns<T>) {
  return (["one_time", "retainer", "hybrid"] as const).map((type) => {
    const pick = (list: T[]) => list.filter((d) => (d.deal_type ?? "one_time") === type);
    const won = pick(b.won);
    const open = pick(b.open);
    const lost = pick(b.lost);
    const sum = (list: T[]) => list.reduce((acc, d) => acc + dealTotal(d, fx), 0);
    return {
      type,
      wonCount: won.length,
      won: sum(won),
      openCount: open.length,
      open: sum(open),
      lostCount: lost.length,
      lost: sum(lost),
    };
  });
}
