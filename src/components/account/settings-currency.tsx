import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { useAuth } from "@/lib/live/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime } from "@/components/live/kit";

// Fetches USD-based rates from open.er-api.com (free, no key) and upserts
// fx_rates + today's fx_rates_history. Skips the fetch when rates are < 12 h old.
export const refreshFxRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: "fresh" | "refreshed" | "failed" }> => {
    const { ctxOf, adminClient } = await import("@/lib/live/server-ctx");
    const { sb } = ctxOf(context);
    const { data: latest } = await sb
      .from("fx_rates")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.updated_at && Date.now() - new Date(latest.updated_at as string).getTime() < 12 * 36e5) {
      return { status: "fresh" };
    }
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) return { status: "failed" };
      const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (json.result !== "success" || !json.rates) return { status: "failed" };
      const now = new Date().toISOString();
      const day = now.slice(0, 10);
      const rates = Object.entries(json.rates).filter(([, v]) => typeof v === "number" && v > 0);
      // fx tables are global reference data; writes go through the service role.
      const admin = await adminClient();
      const { error: e1 } = await admin
        .from("fx_rates")
        .upsert(rates.map(([currency, per_usd]) => ({ currency, per_usd, updated_at: now })), { onConflict: "currency" });
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await admin
        .from("fx_rates_history")
        .upsert(rates.map(([currency, per_usd]) => ({ currency, day, per_usd })), { onConflict: "currency,day" });
      if (e2) throw new Error(e2.message);
      return { status: "refreshed" };
    } catch (e) {
      console.error("[fx] refresh failed", e);
      return { status: "failed" };
    }
  });

const COMMON = ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "AED", "SGD"];
const db = supabase as any;

function currencySymbol(code: string) {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? code
    );
  } catch {
    return code;
  }
}
function currencyName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}
function formatRate(n: number) {
  if (!Number.isFinite(n)) return "-";
  const digits = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Workspace report currency (live: app-shell `useReportCurrency`). */
function useReportCurrency(workspaceId?: string) {
  const { data } = useQuery({
    queryKey: ["report_currency", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await db.from("workspaces").select("report_currency").eq("id", workspaceId).maybeSingle();
      if (error) throw error;
      return (data?.report_currency as string | null) ?? "USD";
    },
  });
  return data ?? "USD";
}

export function CrmCurrencySettings() {
  const { workspace } = useAuth();
  const current = useReportCurrency(workspace?.id);
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [other, setOther] = useState("");
  const autoRefreshed = useRef(false);
  useEffect(() => setOther(""), [current]);
  const isOwner = workspace?.role === "owner";

  const { data: rates } = useQuery({
    queryKey: ["fx_rates_table"],
    staleTime: 3_600_000,
    queryFn: async () => {
      const { data, error } = await db.from("fx_rates").select("currency, per_usd, updated_at").order("currency");
      if (error) throw error;
      return (data ?? []) as { currency: string; per_usd: number | string; updated_at: string }[];
    },
  });

  const refresh = async (silent = false) => {
    setRefreshing(true);
    try {
      const res = await refreshFxRates();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["fx_rates_table"] }),
        qc.invalidateQueries({ queryKey: ["fx_rates"] }),
      ]);
      if (res.status === "failed") toast.error("Exchange rates could not be refreshed. Please try again later.");
      else if (!silent)
        toast.success(
          res.status === "fresh" ? "Exchange rates are already up to date." : "Exchange rates refreshed.",
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Exchange rates could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (rates && rates.length === 0 && !autoRefreshed.current) {
      autoRefreshed.current = true;
      void refresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  const rateMap = useMemo(() => new Map((rates ?? []).map((r) => [r.currency, Number(r.per_usd)])), [rates]);
  const lastUpdated = useMemo(
    () => (rates ?? []).reduce<string | null>((acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc), null),
    [rates],
  );
  const others = useMemo(() => (rates ?? []).map((r) => r.currency).filter((c) => !COMMON.includes(c)), [rates]);

  const choose = async (code: string) => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) return toast.error("Pick a currency from the list.");
    setSaving(true);
    const { error } = await db.from("workspaces").update({ report_currency: c }).eq("id", workspace!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`CRM totals now shown in ${currencySymbol(c)} ${c}`);
    void qc.invalidateQueries({ queryKey: ["report_currency"] });
    void qc.invalidateQueries({ queryKey: ["revenue_summary"] });
    void qc.invalidateQueries({ queryKey: ["revenue_summary_dashboard"] });
  };

  const tableRows = COMMON.includes(current) ? COMMON : [...COMMON, current];

  return (
    <div className="space-y-4 text-[13px]">
      <p className="text-muted-foreground">
        All CRM totals, charts and revenue views are shown in this currency. Each deal still keeps its own currency.
        Deals in another currency are converted through US dollars: won deals at the rate from the day they closed,
        open deals at today's rate. Default is US dollars.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {COMMON.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={c === current ? "default" : "outline"}
            className="h-8 gap-1.5"
            disabled={!isOwner || saving}
            onClick={() => c !== current && void choose(c)}
            title={currencyName(c)}
          >
            <span className={cn("font-mono", c !== current && "text-muted-foreground")}>{currencySymbol(c)}</span>
            {c}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={other} onValueChange={setOther} disabled={!isOwner || !others.length}>
          <SelectTrigger className="h-8 w-[260px] text-[13px]">
            <SelectValue
              placeholder={
                COMMON.includes(current)
                  ? "Another currency"
                  : `${currencySymbol(current)} ${current} · ${currencyName(current)}`
              }
            />
          </SelectTrigger>
          <SelectContent className="max-h-[320px]">
            {others.map((c) => (
              <SelectItem key={c} value={c}>
                {currencySymbol(c)} {c} · {currencyName(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8"
          disabled={!isOwner || saving || !other || other === current}
          onClick={() => void choose(other)}
        >
          Use this currency
        </Button>
        {!isOwner && <span className="text-muted-foreground">Only the workspace owner can change this.</span>}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-subtle/50 px-3 py-2">
          <span className="font-medium">Today's rates against US dollars</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">
              {lastUpdated
                ? `Updated automatically every day · last ${fmtDateTime(lastUpdated)}`
                : "No rates saved yet. They update automatically once a day."}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              disabled={refreshing}
              onClick={() => void refresh(false)}
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing..." : "Refresh rates"}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="h-8 px-3 text-left font-medium text-muted-foreground">Currency</th>
                <th className="h-8 px-3 text-right font-medium text-muted-foreground">1 USD =</th>
                <th className="h-8 px-3 text-right font-medium text-muted-foreground">= USD</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((c) => {
                const rate = c === "USD" ? 1 : rateMap.get(c);
                return (
                  <tr
                    key={c}
                    className={cn("h-9 border-b border-border last:border-0", c === current && "bg-subtle/60")}
                  >
                    <td className="px-3">
                      <span className="inline-block w-7 font-mono text-muted-foreground">{currencySymbol(c)}</span>
                      <span className="font-medium">{c}</span>
                      <span className="ml-2 text-muted-foreground">{currencyName(c)}</span>
                      {c === current && (
                        <span className="ml-2 rounded-full bg-foreground px-1.5 py-0.5 text-[10.5px] font-medium text-background">
                          CRM
                        </span>
                      )}
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {rate ? `${currencySymbol(c)}${formatRate(rate)}` : "-"}
                    </td>
                    <td className="px-3 text-right tabular-nums text-muted-foreground">
                      {rate ? `$${formatRate(1 / rate)}` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
          Rates come from{" "}
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            ExchangeRate-API
          </a>{" "}
          (open.er-api.com/v6/latest/USD), fetched once a day. Only the currency rates are requested; none of your
          data is sent.
        </div>
      </div>
    </div>
  );
}
