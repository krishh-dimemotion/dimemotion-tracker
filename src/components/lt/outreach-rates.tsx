// Ported from live chunk OutreachRates-DwuVxkX0.js
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, HelpCircle, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Loading } from "@/components/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { useChannels } from "@/hooks/useLookups";
import { todayISO, addDaysISO } from "@/lib/format";
import { cn } from "@/lib/utils";
// Shared (ported in parallel): live kit DateRangePicker (kit chunk `d` = Uu)
import { DateRangePicker, pct } from "@/components/live/kit";
// Shared: outreach-channels chunk `r` (= c), app_settings "outreach_channels" query
import { useOutreachChannels } from "@/lib/live/outreach-channels";

export type RangeKey = "today" | "week" | "month" | "30d" | "custom";

export function resolveRange(key: RangeKey, customFrom: string, customTo: string) {
  const today = todayISO();
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    const dow = new Date(today).getDay();
    const back = dow === 0 ? 6 : dow - 1;
    return { from: addDaysISO(-back, today), to: today };
  }
  if (key === "month") return { from: today.slice(0, 8) + "01", to: today };
  if (key === "30d") return { from: addDaysISO(-29, today), to: today };
  return { from: customFrom || today, to: customTo || today };
}

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  "30d": "Last 30 days",
  custom: "Custom",
};

export type RateRange = ReturnType<typeof useRateRange>;

export function useRateRange(initial: RangeKey = "month") {
  const [rangeKey, setRangeKey] = useState<RangeKey>(initial);
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const { from, to } = resolveRange(rangeKey, customFrom, customTo);
  return { rangeKey, setRangeKey, customFrom, setCustomFrom, customTo, setCustomTo, from, to };
}

export function RangePicker({ range }: { range: RateRange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex max-w-full flex-wrap gap-0.5 rounded-[10px] border border-border bg-subtle p-[3px]">
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => range.setRangeKey(k)}
            className={cn(
              "pressable rounded-[7px] px-3 py-1 text-[12.5px] font-medium whitespace-nowrap transition-colors",
              range.rangeKey === k ? "bg-foreground text-background shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_LABELS[k]}
          </button>
        ))}
      </div>
      {range.rangeKey === "custom" && (
        <DateRangePicker
          from={range.customFrom}
          to={range.customTo}
          onChange={(f: string, t: string) => {
            range.setCustomFrom(f);
            range.setCustomTo(t);
          }}
        />
      )}
    </div>
  );
}

const BUILTIN = [
  { kind: "email", label: "Email" },
  { kind: "instagram", label: "Instagram" },
  { kind: "linkedin", label: "LinkedIn" },
] as const;
type BuiltinKind = (typeof BUILTIN)[number]["kind"];

type Tile = { key: string; label: string; value: string; hasData: boolean; detail: string; bar: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
type RateLead = Record<string, any>;

function tile(key: string, label: string, n: number, d: number): Tile {
  const r = pct(n, d) as { text: string; hasData: boolean };
  const text = r.text;
  const hasData = r.hasData;
  return { key, label, value: text, hasData, detail: `${n}/${d}`, bar: hasData ? Math.max(0, Math.min(100, parseFloat(text) || 0)) : 0 };
}

const anySent = (l: RateLead) => l.email_sent || l.instagram_sent || l.linkedin_sent;
const anyReplied = (l: RateLead) => l.email_replied || l.instagram_replied || l.linkedin_replied;

function computeTiles(leads: RateLead[], scope: string, channels: any[]): Tile[] {
  const kindOf = (id: string | null) => channels.find((c) => c.id === id)?.kind;
  const isOther = (id: string | null) => kindOf(id) === "other";
  let pool: RateLead[];
  let isSent: (l: RateLead) => boolean;
  let isReplied: (l: RateLead) => boolean;
  const tiles: Tile[] = [];
  if (scope === "email" || scope === "instagram" || scope === "linkedin") {
    const k = scope as BuiltinKind;
    const sent = (l: RateLead) => (k === "email" ? l.email_sent : k === "instagram" ? l.instagram_sent : l.linkedin_sent);
    pool = leads.filter((l) => kindOf(l.channel_id) === k || sent(l) || (k === "linkedin" && l.linkedin_connection_sent));
    isSent = sent;
    isReplied = (l) => (k === "email" ? l.email_replied : k === "instagram" ? l.instagram_replied : l.linkedin_replied);
    const label = BUILTIN.find((b) => b.kind === k)!.label;
    const sentCount = pool.filter(isSent).length;
    if (k === "linkedin")
      tiles.push(tile("connection", "Connection request rate", pool.filter((l) => l.linkedin_connection_sent).length, pool.length));
    tiles.push(tile("sent", `${label} sent rate`, sentCount, pool.length));
    if (k === "email") tiles.push(tile("view", "Email view rate", pool.filter((l) => l.email_viewed).length, sentCount));
  } else if (scope === "all") {
    pool = leads;
    isSent = (l) => anySent(l) || isOther(l.contacted_channel_id);
    isReplied = (l) => anyReplied(l) || isOther(l.reply_channel_id);
    const s = pool.filter(isSent).length;
    tiles.push(tile("sent", "Outreach sent rate", s, pool.length));
    tiles.push(tile("email_sent", "Email sent rate", pool.filter((l) => l.email_sent).length, pool.length));
    tiles.push(tile("instagram_sent", "Instagram sent rate", pool.filter((l) => l.instagram_sent).length, pool.length));
    tiles.push(tile("linkedin_sent", "LinkedIn sent rate", pool.filter((l) => l.linkedin_sent).length, pool.length));
    tiles.push(tile("view", "Email view rate", pool.filter((l) => l.email_viewed).length, pool.filter((l) => l.email_sent).length));
  } else {
    const id = scope;
    const name = channels.find((c) => c.id === id)?.name ?? "Channel";
    pool = leads.filter((l) => l.channel_id === id || l.contacted_channel_id === id);
    isSent = (l) => l.contacted_channel_id === id || anySent(l);
    isReplied = (l) => l.reply_channel_id === id || anyReplied(l) || l.reply_sentiment != null;
    tiles.push(tile("sent", `${name} sent rate`, pool.filter(isSent).length, pool.length));
  }
  const sent = pool.filter(isSent);
  const replied = pool.filter(isReplied);
  const loomSent = pool.filter((l) => l.loom_sent);
  const loomWatched = pool.filter((l) => l.loom_watched);
  const watchPcts = loomWatched.filter((l) => l.loom_watch_percent != null).map((l) => l.loom_watch_percent as number);
  const meetings = pool.filter((l) => l.meeting_booked);
  const avg = watchPcts.length ? watchPcts.reduce((a, b) => a + b, 0) / watchPcts.length : 0;
  tiles.push(tile("reply", "Reply rate", replied.length, sent.length));
  tiles.push(tile("positive", "Positive reply rate", replied.filter((l) => l.reply_sentiment === "positive").length, replied.length));
  tiles.push(tile("negative", "Negative reply rate", replied.filter((l) => l.reply_sentiment === "negative").length, replied.length));
  tiles.push(tile("loom_sent", "Loom sent rate", loomSent.length, sent.length));
  tiles.push(tile("loom_view", "Loom view rate", loomWatched.length, loomSent.length));
  tiles.push({
    key: "loom_watch",
    label: "Avg Loom watch %",
    value: watchPcts.length ? `${Math.round(avg)}%` : "0%",
    hasData: watchPcts.length > 0,
    detail: `over ${watchPcts.length} watched`,
    bar: watchPcts.length ? Math.round(avg) : 0,
  });
  tiles.push(tile("meetings", "Meetings booked rate", meetings.length, replied.length));
  tiles.push(tile("close", "Client close rate", meetings.filter((l) => l.client_closed).length, meetings.length));
  return tiles;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function defaultHidden(scope: string, kinds: string[] | null): string[] {
  if (scope !== "all" || !kinds || kinds.length === 0) return [];
  const out: string[] = [];
  for (const b of BUILTIN) if (!kinds.includes(b.kind)) out.push(`${b.kind}_sent`);
  if (!kinds.includes("email")) out.push("view");
  return out;
}

function defaultScope(kinds: string[] | null, customIds: string[]) {
  if (kinds && kinds.length === 1 && customIds.length === 0) return kinds[0];
  if ((!kinds || kinds.length === 0) && customIds.length === 1) return customIds[0];
  return "all";
}

// Live app-shell `D` (Hr): help link to docs section. Not in repo; local stand-in.
function HelpLink({ section, label = "What does this mean?" }: { section: string; label?: string }) {
  // TODO: point at the live docs URL builder (app-shell Vr(section))
  return (
    <a
      href={`#${section}`}
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
    >
      <HelpCircle className="size-3.5" />
    </a>
  );
}

export function OutreachRateTiles({
  from,
  to,
  scope,
  title = "Outreach rates",
}: {
  from: string;
  to: string;
  scope?: string;
  title?: string;
}) {
  // TODO: live useAuth exposes `workspace`; repo auth may not
  const auth = useAuth() as unknown as { workspace?: { id: string } | null };
  const { data: channels } = useChannels();
  const { data: prefs } = useOutreachChannels() as { data?: { kinds: string[]; custom: string[] } | null };
  const ws = auth.workspace?.id ?? "none";
  const scopeKey = `tracker.rates.${ws}.scope`;
  const customChannels = useMemo(
    () => ((channels ?? []) as any[]).filter((c) => c.kind === "other" && c.is_active !== false),
    [channels],
  );
  const [savedScope, setSavedScope] = useState<string | null>(null);
  useEffect(() => {
    setSavedScope(readLS<string | null>(scopeKey, null));
  }, [scopeKey]);

  const fallback = defaultScope(
    prefs?.kinds ?? null,
    customChannels.filter((c) => prefs?.custom.includes(c.name)).map((c) => c.id),
  );
  let active = scope ?? savedScope ?? fallback;
  if (active !== "all" && !BUILTIN.some((b) => b.kind === active) && channels && !customChannels.some((c) => c.id === active))
    active = "all";

  const hiddenKey = `tracker.rates.${ws}.hidden.${active}`;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    setHidden(new Set(readLS<string[]>(hiddenKey, defaultHidden(active, prefs?.kinds ?? null))));
  }, [hiddenKey, active, prefs]);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeLS(hiddenKey, [...next]);
      return next;
    });
  const showAll = () => {
    setHidden(new Set());
    writeLS(hiddenKey, []);
  };
  const pickScope = (id: string) => {
    setSavedScope(id);
    writeLS(scopeKey, id);
  };

  const { data: leads, isLoading } = useQuery({
    queryKey: ["outreach-rate-leads", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "channel_id,contacted_channel_id,reply_channel_id,email_sent,email_viewed,email_replied,instagram_sent,instagram_replied,linkedin_connection_sent,linkedin_sent,linkedin_replied,loom_sent,loom_watched,loom_watch_percent,meeting_booked,client_closed,reply_sentiment",
        )
        .gte("date_added", from)
        .lte("date_added", to);
      if (error) throw error;
      return (data ?? []) as RateLead[];
    },
  });

  const tiles = useMemo(() => computeTiles(leads ?? [], active, (channels ?? []) as any[]), [leads, active, channels]);
  const visible = tiles.filter((t) => !hidden.has(t.key));
  const hiddenCount = tiles.length - visible.length;
  const enabledKinds = useMemo(() => (!prefs?.kinds || prefs.kinds.length === 0 ? null : new Set(prefs.kinds)), [prefs]);
  const tabs = useMemo(() => {
    const out: { id: string; label: string }[] = [{ id: "all", label: "All channels" }];
    const builtins = enabledKinds ? BUILTIN.filter((b) => enabledKinds.has(b.kind)) : BUILTIN;
    out.push(...builtins.map((b) => ({ id: b.kind as string, label: b.label as string })));
    const customs = prefs?.custom?.length ? customChannels.filter((c) => prefs.custom.includes(c.name)) : customChannels;
    out.push(...customs.map((c) => ({ id: c.id as string, label: c.name as string })));
    return out;
  }, [enabledKinds, customChannels, prefs]);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-[13px] font-semibold tracking-tight">
          <span className="truncate">{title}</span>
          <HelpLink section="dashboard-rates" label="How these rates are calculated" />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {!scope && (
            <div
              role="tablist"
              aria-label="Channel"
              className="flex max-w-full flex-wrap gap-0.5 rounded-[10px] border border-border bg-subtle p-[3px]"
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active === t.id}
                  onClick={() => pickScope(t.id)}
                  className={cn(
                    "pressable max-w-[160px] truncate rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                    active === t.id ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] font-medium shadow-xs hover:border-foreground/25"
              >
                <SlidersHorizontal className="size-3.5" />
                Customize
                {hiddenCount > 0 && (
                  <span className="rounded-full bg-subtle px-1.5 font-mono text-[10.5px] text-muted-foreground">
                    {hiddenCount} hidden
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[280px] p-2">
              <div className="flex items-center justify-between px-2 pt-1 pb-2">
                <span className="section-label">Rates to show</span>
                {hiddenCount > 0 && (
                  <button type="button" onClick={showAll} className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
                    Show all
                  </button>
                )}
              </div>
              <div className="flex max-h-[320px] flex-col overflow-y-auto">
                {tiles.map((t) => {
                  const off = hidden.has(t.key);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggle(t.key)}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-subtle"
                    >
                      <span className={cn("min-w-0 truncate", off && "text-muted-foreground line-through")}>{t.label}</span>
                      {off ? (
                        <EyeOff className="size-3.5 shrink-0 text-faint" />
                      ) : (
                        <Eye className="size-3.5 shrink-0 text-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="px-2 pt-2 pb-1 text-[11px] text-muted-foreground">
                Saved for you on this device, separately for each channel.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {isLoading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-subtle/40 p-6 text-center text-[13px] text-muted-foreground">
          All rates are hidden.{" "}
          <button type="button" onClick={showAll} className="font-medium text-foreground underline underline-offset-2">
            Show all
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))] gap-3">
          {visible.map((t) => (
            <RateTile key={t.key} tile={t} onHide={() => toggle(t.key)} />
          ))}
        </div>
      )}
    </section>
  );
}

function RateTile({ tile, onHide }: { tile: Tile; onHide: () => void }) {
  return (
    <div className="group pro-card relative flex min-w-0 flex-col px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="section-label min-w-0 leading-snug break-words">{tile.label}</div>
        <button
          type="button"
          onClick={onHide}
          aria-label={`Hide ${tile.label}`}
          title="Hide this rate"
          className="-mt-0.5 -mr-1 shrink-0 rounded-md p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-subtle hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <EyeOff className="size-3.5" />
        </button>
      </div>
      <div className="metric-number mt-1 text-[20px]">{tile.value}</div>
      <div className="mb-2 truncate font-mono text-[11px] text-muted-foreground">{tile.hasData ? tile.detail : "no data yet"}</div>
      <div className="mt-auto h-1 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${tile.bar}%` }} />
      </div>
    </div>
  );
}

/** Channel page block: range picker + rate tiles scoped to one channel kind. */
export function ChannelOutreachRates({ kind, label, range }: { kind: string; label: string; range?: RateRange }) {
  const own = useRateRange("month");
  const r = range ?? own;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <RangePicker range={r} />
      <OutreachRateTiles from={r.from} to={r.to} scope={kind} title={`${label} outreach rates`} />
    </div>
  );
}
