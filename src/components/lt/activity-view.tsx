// Ported from live chunk ActivityView-BlPm54Ia.js
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { AppPage, type ModuleKey } from "@/components/app-shell";
import { Card, EmptyState, Loading, todayISO } from "@/components/live/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { cn } from "@/lib/utils";
import {
  AddActivityForm,
  EVENT_TYPES,
  EventRow,
  eventLabel,
  useEventActions,
  type LeadEvent,
} from "@/components/lt/events";

const RANGES = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const OUTREACH = new Set(EVENT_TYPES.filter((t) => t.group === "Outreach").map((t) => t.value));
const REPLIES = new Set(EVENT_TYPES.filter((t) => t.group === "Replies").map((t) => t.value));

const KINDS = [
  { value: "all", label: "All" },
  { value: "outreach", label: "Outreach" },
  { value: "replies", label: "Replies" },
  { value: "stages", label: "Stage & status" },
  { value: "notes", label: "Notes & calls" },
  { value: "other", label: "Other" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

function kindOf(type: string): Exclude<Kind, "all"> {
  if (OUTREACH.has(type)) return "outreach";
  if (REPLIES.has(type)) return "replies";
  if (type.endsWith("_changed")) return "stages";
  if (type === "note" || type === "call") return "notes";
  return "other";
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const key = d.toLocaleDateString("en-CA");
  const today = todayISO();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return "Today";
  if (key === y.toLocaleDateString("en-CA")) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function ActivityView({ module, perm }: { module: ModuleKey; perm?: string }) {
  const { can, isAdmin } = useAuth();
  const canEdit = isAdmin || can("lead.lead_edit");
  const qc = useQueryClient();
  const [range, setRange] = useState("30");
  const [kind, setKind] = useState<Kind>("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const since = useMemo(() => {
    if (range === "all") return null;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (Number(range) - 1));
    return d.toISOString();
  }, [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["activity-all", since],
    queryFn: async () => {
      let q = supabase
        .from("lead_events")
        .select("id, event_type, occurred_at, meta, lead_id, leads(company_name, lead_code), profiles(full_name, email)")
        .order("occurred_at", { ascending: false })
        .limit(2000);
      if (since) q = q.gte("occurred_at", since);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LeadEvent[];
    },
  });

  const { saveEdit, remove, add } = useEventActions(() => void qc.invalidateQueries());

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { all: 0, outreach: 0, replies: 0, stages: 0, notes: 0, other: 0 };
    for (const e of data ?? []) {
      c.all++;
      c[kindOf(e.event_type)]++;
    }
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((e) => {
      if (kind !== "all" && kindOf(e.event_type) !== kind) return false;
      if (!term) return true;
      return [eventLabel(e), e.leads?.company_name ?? "", e.leads?.lead_code ?? "", e.profiles?.full_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [data, kind, search]);

  const groups = useMemo(() => {
    const m = new Map<string, LeadEvent[]>();
    for (const e of filtered) {
      const k = dayLabel(e.occurred_at);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    // live: guide="activity" (repo AppPage has no guide prop)
    <AppPage
      module={module}
      title="Activity"
      perm={perm}
      actions={
        canEdit && !adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add activity
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-8 w-[150px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lead, entry or person"
                className="h-8 w-[240px] pl-7 text-[13px]"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px]",
                    kind === k.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
                  )}
                >
                  {k.label} <span className="opacity-70">{counts[k.value] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Outreach and reply entries here are what the Ledger and Outreach Tracker count. Fix or delete wrong ones
            and the numbers update.
          </p>
        </Card>
        {adding && (
          <AddActivityForm
            onCancel={() => setAdding(false)}
            onAdd={async (a) => {
              await add(a);
              setAdding(false);
            }}
          />
        )}
        {isLoading ? (
          <Loading label="Loading activity" />
        ) : groups.length === 0 ? (
          <EmptyState title="No activity" hint="Nothing matches these filters." />
        ) : (
          groups.map(([day, events]) => (
            <Card key={day} title={`${day} · ${events.length}`}>
              <div className="flex flex-col gap-3">
                {events.map((e) => (
                  <EventRow
                    key={`${e.id}-${e.occurred_at}-${e.event_type}-${eventLabel(e)}`}
                    e={e}
                    showLead
                    canEdit={canEdit}
                    onEdit={(edit) => saveEdit(e, edit)}
                    onDelete={() => void remove(e)}
                  />
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </AppPage>
  );
}
