// Ported from live app-shell (hn / gn). Workspace report currency plus FX conversion helpers.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { money } from "@/components/live/kit";

export const normCurrency = (c: string | null | undefined) => (c ?? "USD").trim().toUpperCase() || "USD";

type FxDeal = {
  estimated_value?: number | null;
  currency?: string | null;
  usd_value_at_close?: number | null;
  usd_mrr_at_close?: number | null;
  usd_value_manual?: boolean | null;
  received_amount?: number | null;
  received_currency?: string | null;
  mrr_amount?: number | null;
  closed_at?: string | null;
};

export function useReportCurrencyCode() {
  // Assumes the ported auth context exposes the active workspace.
  const { workspace } = useAuth() as unknown as { workspace?: { id: string } | null };
  return useQuery({
    queryKey: ["report_currency", workspace?.id],
    enabled: !!workspace?.id,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("workspaces")
        .select("report_currency")
        .eq("id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return normCurrency(data?.report_currency);
    },
  });
}

export function useReportCurrency() {
  const codeQuery = useReportCurrencyCode();
  const code = codeQuery.data ?? "USD";
  const { data: rates } = useQuery({
    queryKey: ["fx_rates"],
    staleTime: 21_600_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fx_rates").select("currency, per_usd");
      if (error) throw error;
      return new Map<string, number>((data ?? []).map((r: any) => [r.currency, Number(r.per_usd)]));
    },
  });
  const { data: history, isFetched: historyFetched } = useQuery({
    queryKey: ["fx_rates_history", code],
    enabled: code !== "USD",
    staleTime: 21_600_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fx_rates_history")
        .select("day, per_usd")
        .eq("currency", code)
        .order("day");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ day: r.day as string, rate: Number(r.per_usd) }));
    },
  });

  return useMemo(() => {
    const perUsd = (c: string) => (c === "USD" ? 1 : (rates?.get(c) ?? 1));
    const rateOn = (date: string | null | undefined) => {
      if (code === "USD") return 1;
      if (!date || !history?.length) return perUsd(code);
      let r = history[0].rate;
      for (const h of history) {
        if (h.day <= date.slice(0, 10)) r = h.rate;
        else break;
      }
      return r;
    };
    const convert = (amount: number | null | undefined, from: string | null | undefined) => {
      const n = Number(amount ?? 0);
      const f = normCurrency(from);
      return !n || f === code ? n : (n / perUsd(f)) * perUsd(code);
    };
    const lockedAtClose = (d: FxDeal) => !!d.closed_at && d.usd_value_at_close != null;
    return {
      ready: !!rates && codeQuery.isFetched && (code === "USD" || historyFetched),
      code,
      convert,
      value: (d: FxDeal) =>
        d.usd_value_manual && d.received_amount != null && normCurrency(d.received_currency) === code
          ? Number(d.received_amount)
          : normCurrency(d.currency) === code && !d.usd_value_manual
            ? Number(d.estimated_value ?? 0)
            : lockedAtClose(d)
              ? Number(d.usd_value_at_close) * rateOn(d.closed_at)
              : convert(d.estimated_value, d.currency),
      mrr: (d: FxDeal) =>
        normCurrency(d.currency) === code
          ? Number(d.mrr_amount ?? 0)
          : d.closed_at && d.usd_mrr_at_close != null
            ? Number(d.usd_mrr_at_close) * rateOn(d.closed_at)
            : convert(d.mrr_amount, d.currency),
      fmt: (n: number) => money(n, code),
    };
  }, [rates, history, code, codeQuery.isFetched, historyFetched]);
}

export type ReportCurrency = ReturnType<typeof useReportCurrency>;
