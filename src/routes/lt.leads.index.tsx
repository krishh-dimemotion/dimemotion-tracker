// Ported from live chunk lt.leads.index-Bpm776UG.js
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  CircleCheck,
  Columns3,
  ExternalLink,
  FileText,
  Globe,
  Instagram,
  LayoutGrid,
  Linkedin,
  Mail,
  Plus,
  SquareCheckBig,
  Table as TableIcon,
  Trash2,
  Upload,
  Video,
  X,
  Youtube,
  Calendar,
} from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { useLeadPeek } from "@/components/lt/events"; // TODO: useLeadPeek is Ua in the live app-shell chunk; repo app-shell lacks it
import { LeadLink } from "@/components/lt/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Card,
  CollapsibleCard,
  DateRangePicker,
  EmptyState,
  Loading,
  Pill,
  downloadCsv,
  todayISO,
} from "@/components/live/kit";
import { useOutreachChannelsConfig } from "@/lib/live/outreach-channels";
import { StagePill } from "@/components/leads/StagePill";
import { useStages, useCountries, useChannels, useSenderAccounts, useTags } from "@/hooks/useLookups";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import type { Lead } from "@/components/leads/types";
import { LEAD_STATUSES } from "@/components/lt/lead-types";
import { DownloadIcon, LEAD_VIEW_STORAGE_KEY, viewFromProfileDefault } from "@/components/lt/lead-view";

export const Route = createFileRoute("/lt/leads/")({
  component: LeadsPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Named = { id: string; name: string };
type AnyRow = Record<string, any>;

const WHEN_FIELDS: Named[] = [
  { id: "updated_at", name: "Last activity" },
  { id: "last_contacted_at", name: "Last contacted" },
  { id: "next_followup_date", name: "Follow-up date" },
];

function whenRanges(field: string): Named[] {
  return field === "next_followup_date"
    ? [
        { id: "overdue", name: "Overdue" },
        { id: "today", name: "Today" },
        { id: "next7", name: "Next 7 days" },
        { id: "none", name: "No follow-up set" },
        { id: "custom", name: "Custom dates" },
      ]
    : [
        { id: "today", name: "Today" },
        { id: "last7", name: "Last 7 days" },
        { id: "last30", name: "Last 30 days" },
        { id: "older30", name: "More than 30 days ago" },
        ...(field === "last_contacted_at" ? [{ id: "none", name: "Never contacted" }] : []),
        { id: "custom", name: "Custom dates" },
      ];
}

type Filters = {
  search: string;
  stageId: string;
  countryId: string;
  channelId: string;
  senderAccountId: string;
  status: string;
  tagId: string;
  dateFrom: string;
  dateTo: string;
  hasReplied: string;
  hasLoomSent: string;
  whenField: string;
  whenRange: string;
  whenFrom: string;
  whenTo: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  stageId: "",
  countryId: "",
  channelId: "",
  senderAccountId: "",
  status: "",
  tagId: "",
  dateFrom: "",
  dateTo: "",
  hasReplied: "",
  hasLoomSent: "",
  whenField: "updated_at",
  whenRange: "",
  whenFrom: "",
  whenTo: "",
};

const startOfDay = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

function localISODate(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 10);
}

function applyWhen(q: any, f: Filters) {
  const field = f.whenField;
  if (!f.whenRange) return q;
  const isDate = field === "next_followup_date";
  const lo = (d: string) => (isDate ? d : startOfDay(d));
  const hi = (d: string) => (isDate ? d : endOfDay(d));
  const today = todayISO();
  const shift = (n: number) => {
    const t = new Date(`${today}T12:00:00`);
    t.setDate(t.getDate() + n);
    return localISODate(t);
  };
  switch (f.whenRange) {
    case "today":
      return q.gte(field, lo(today)).lte(field, hi(today));
    case "last7":
      return q.gte(field, lo(shift(-6))).lte(field, hi(today));
    case "last30":
      return q.gte(field, lo(shift(-29))).lte(field, hi(today));
    case "older30":
      return q.lt(field, lo(shift(-29)));
    case "overdue":
      return q.lt(field, lo(today));
    case "next7":
      return q.gte(field, lo(today)).lte(field, hi(shift(7)));
    case "none":
      return q.is(field, null);
    case "custom": {
      let r = q;
      if (f.whenFrom) r = r.gte(field, lo(f.whenFrom));
      if (f.whenTo) r = r.lte(field, hi(f.whenTo));
      return r;
    }
    default:
      return q;
  }
}

function followupBucketLabel(d: string | null) {
  if (!d) return "No follow-up";
  const today = todayISO();
  const n = new Date(today);
  n.setDate(n.getDate() + 7);
  const upper = n.toISOString().slice(0, 10);
  return d < today ? "Overdue" : d === today ? "Today" : d <= upper ? "Upcoming (7d)" : "Later";
}

const SORT_FIELDS: Named[] = [
  { id: "updated_at", name: "Last activity" },
  { id: "last_contacted_at", name: "Last contacted" },
  { id: "next_followup_date", name: "Follow-up date" },
  { id: "date_added", name: "Date added" },
  { id: "company_name", name: "Company name" },
];

function FilterSelect({
  label,
  value,
  onValue,
  options,
}: {
  label: string;
  value: string;
  onValue: (v: string) => void;
  options: Named[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="section-label">{label}</span>
      <Select value={value || "__all"} onValueChange={(v) => onValue(v === "__all" ? "" : v)}>
        <SelectTrigger className="h-8 w-[160px] text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LeadFilters({
  filters,
  onChange,
  stages,
  countries,
  channels,
  senderAccounts,
  tags,
  sortField,
  sortDir,
  onSortChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  stages: AnyRow[];
  countries: AnyRow[];
  channels: AnyRow[];
  senderAccounts: AnyRow[];
  tags: AnyRow[];
  sortField?: string;
  sortDir?: string;
  onSortChange?: (field: string, dir: "asc" | "desc") => void;
}) {
  const { data: cfg } = useOutreachChannelsConfig();
  const set = (k: keyof Filters, v: string) => onChange({ ...filters, [k]: v });
  const visibleChannels = useMemo(() => {
    if (!cfg || (!cfg.kinds?.length && !cfg.custom?.length)) return channels;
    const kinds = new Set<string>(cfg.kinds || []);
    const custom = new Set<string>((cfg.custom || []).map((c: string) => c.toLowerCase()));
    const out = channels.filter((c) => !!(kinds.has(c.kind) || (c.kind === "other" && custom.has(c.name.toLowerCase()))));
    return out.length > 0 ? out : channels;
  }, [channels, cfg]);

  const activeCount = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter(
    (k) => k !== "whenField" && k !== "search" && String(filters[k] ?? "") !== String(EMPTY_FILTERS[k] ?? ""),
  ).length;

  return (
    <CollapsibleCard
      id="lt.filters"
      defaultOpen={false}
      title={
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-info px-1.5 font-mono text-[10.5px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </span>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="section-label">Search</span>
          <Input
            className="h-8 w-[220px] text-[13px]"
            placeholder="Company, contact, code"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        <FilterSelect label="Stage" value={filters.stageId} onValue={(v) => set("stageId", v)} options={stages.map((s) => ({ id: s.id, name: s.name }))} />
        <FilterSelect label="Country" value={filters.countryId} onValue={(v) => set("countryId", v)} options={countries.map((c) => ({ id: c.id, name: c.name }))} />
        <FilterSelect label="Channel" value={filters.channelId} onValue={(v) => set("channelId", v)} options={visibleChannels.map((c) => ({ id: c.id, name: c.name }))} />
        <FilterSelect
          label="Sender account"
          value={filters.senderAccountId}
          onValue={(v) => set("senderAccountId", v)}
          options={senderAccounts.map((a) => ({ id: a.id, name: a.label }))}
        />
        <FilterSelect label="Status" value={filters.status} onValue={(v) => set("status", v)} options={LEAD_STATUSES.map((s) => ({ id: s, name: s }))} />
        <FilterSelect label="Tag" value={filters.tagId} onValue={(v) => set("tagId", v)} options={tags.map((t) => ({ id: t.id, name: t.name }))} />
        <div className="flex flex-col gap-1">
          <span className="section-label">Date added</span>
          <DateRangePicker
            from={filters.dateFrom || undefined}
            to={filters.dateTo || undefined}
            onChange={(from: string, to: string) => onChange({ ...filters, dateFrom: from, dateTo: to })}
            className="w-[260px]"
          />
        </div>
        <FilterSelect label="Has replied" value={filters.hasReplied} onValue={(v) => set("hasReplied", v)} options={[{ id: "yes", name: "Yes" }, { id: "no", name: "No" }]} />
        <FilterSelect label="Loom sent" value={filters.hasLoomSent} onValue={(v) => set("hasLoomSent", v)} options={[{ id: "yes", name: "Yes" }, { id: "no", name: "No" }]} />
        <div className="flex flex-col gap-1">
          <span className="section-label">When</span>
          <div className="flex items-center gap-1">
            <Select
              value={filters.whenField}
              onValueChange={(v) => onChange({ ...filters, whenField: v, whenRange: "", whenFrom: "", whenTo: "" })}
            >
              <SelectTrigger className="h-8 w-[150px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WHEN_FIELDS.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.whenRange || "__all"} onValueChange={(v) => set("whenRange", v === "__all" ? "" : v)}>
              <SelectTrigger className="h-8 w-[170px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Any time</SelectItem>
                {whenRanges(filters.whenField).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {filters.whenRange === "custom" && (
          <div className="flex flex-col gap-1">
            <span className="section-label">{WHEN_FIELDS.find((w) => w.id === filters.whenField)?.name} between</span>
            <DateRangePicker
              from={filters.whenFrom || undefined}
              to={filters.whenTo || undefined}
              onChange={(from: string, to: string) => onChange({ ...filters, whenFrom: from, whenTo: to })}
              className="w-[260px]"
            />
          </div>
        )}
        {sortField && sortDir && onSortChange && (
          <div className="flex flex-col gap-1">
            <span className="section-label">Sort by</span>
            <div className="flex items-center gap-1">
              <Select
                value={SORT_FIELDS.some((s) => s.id === sortField) ? sortField : "__other"}
                onValueChange={(v) => v !== "__other" && onSortChange(v, v === "company_name" ? "asc" : "desc")}
              >
                <SelectTrigger className="h-8 w-[150px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_FIELDS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                  {!SORT_FIELDS.some((s) => s.id === sortField) && <SelectItem value="__other">Table column</SelectItem>}
                </SelectContent>
              </Select>
              <Select value={sortDir} onValueChange={(v) => onSortChange(sortField, v as "asc" | "desc")}>
                <SelectTrigger className="h-8 w-[140px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">
                    {sortField === "company_name" ? "Z to A" : sortField === "next_followup_date" ? "Latest first" : "Newest first"}
                  </SelectItem>
                  <SelectItem value="asc">
                    {sortField === "company_name" ? "A to Z" : sortField === "next_followup_date" ? "Soonest first" : "Oldest first"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <button
          className="text-[12.5px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => {
            onChange({ ...EMPTY_FILTERS });
            onSortChange?.("updated_at", "desc");
          }}
        >
          Clear all
        </button>
      </div>
    </CollapsibleCard>
  );
}

type Lookups = {
  stages: AnyRow[];
  countries: AnyRow[];
  channels: AnyRow[];
  senderAccounts: AnyRow[];
  leadTags: Record<string, string[]>;
};

function groupLeads(leads: Lead[], groupBy: string, l: Lookups): { label: string; leads: Lead[] }[] {
  if (!groupBy) return [{ label: "", leads }];
  const map = new Map<string, Lead[]>();
  const add = (k: string, lead: Lead) => {
    const arr = map.get(k) ?? [];
    arr.push(lead);
    map.set(k, arr);
  };
  for (const r of leads as AnyRow[]) {
    const lead = r as Lead;
    if (groupBy === "country") add(l.countries.find((c) => c.id === r.country_id)?.name ?? "No country", lead);
    else if (groupBy === "stage") add(l.stages.find((s) => s.id === r.stage_id)?.name ?? "No stage", lead);
    else if (groupBy === "channel") add(l.channels.find((c) => c.id === r.channel_id)?.name ?? "No channel", lead);
    else if (groupBy === "sender_account") add(l.senderAccounts.find((a) => a.id === r.sender_account_id)?.label ?? "No account", lead);
    else if (groupBy === "status") add(r.status ?? "new", lead);
    else if (groupBy === "followup") add(followupBucketLabel(r.next_followup_date), lead);
    else if (groupBy === "date_added") add(fmtDate(r.date_added) || "Unknown", lead);
    else if (groupBy === "tag") {
      const t = l.leadTags[r.id] ?? [];
      if (t.length === 0) add("No tag", lead);
      else t.forEach((name) => add(name, lead));
    }
  }
  return Array.from(map.entries()).map(([label, leads]) => ({ label, leads }));
}

const STATUS_TONE: Record<string, string> = {
  new: "neutral",
  in_progress: "info",
  on_hold: "warning",
  won: "positive",
  lost: "negative",
};

const CHANNEL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  email: Mail,
  linkedin: Linkedin,
  instagram: Instagram,
};

const TH =
  "sticky top-0 z-10 h-10 border-b border-border bg-surface/85 px-3 text-left text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase backdrop-blur-md select-none";

function findStage(stages: AnyRow[], id: string | null) {
  return !id || !stages ? null : (stages.find((s) => s.id === id) ?? null);
}

function LeadsTable({
  leads,
  stages,
  countries,
  channels,
  senderAccounts,
  leadTags,
  selected,
  onToggle,
  onToggleAll,
  sortField,
  sortDir,
  onSort,
  groupBy,
}: Lookups & {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  sortField: string;
  sortDir: string;
  onSort: (f: string) => void;
  groupBy: string;
}) {
  const { openLead } = useLeadPeek();
  const countryLabel = (id: string | null) => {
    const c = countries.find((x) => x.id === id);
    return c ? `${c.flag_emoji ? c.flag_emoji + " " : ""}${c.name}` : "-";
  };
  const channelName = (id: string | null) => channels.find((c) => c.id === id)?.name ?? "-";
  const channelIcon = (id: string | null) => {
    const c = channels.find((x) => x.id === id);
    return c ? (CHANNEL_ICONS[c.kind] ?? CHANNEL_ICONS[String(c.name).toLowerCase()] ?? null) : null;
  };
  const today = new Date().toISOString().slice(0, 10);
  const groups = groupLeads(leads, groupBy, { stages, countries, channels, senderAccounts, leadTags });

  const SortTh = ({ field, children }: { field: string; children: ReactNode }) => (
    <th
      className={cn(TH, "cursor-pointer hover:text-foreground", sortField === field && "text-foreground")}
      onClick={() => onSort(field)}
      aria-sort={sortField === field ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortDir === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )
        ) : (
          <ChevronsUpDown className="size-3 opacity-35" />
        )}
      </span>
    </th>
  );

  return (
    <div className="hidden max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-border bg-surface shadow-xs md:block">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th className={cn(TH, "w-9")}>
              <Checkbox
                checked={leads.length > 0 && leads.every((l) => selected.has(l.id))}
                onCheckedChange={() => onToggleAll(leads.map((l) => l.id))}
              />
            </th>
            <SortTh field="company_name">Company</SortTh>
            <SortTh field="primary_contact">Contact</SortTh>
            <SortTh field="country">Country</SortTh>
            <SortTh field="stage">Stage</SortTh>
            <SortTh field="status">Status</SortTh>
            <th className={TH}>Channel</th>
            <SortTh field="date_added">Added</SortTh>
            <SortTh field="last_contacted_at">Last contacted</SortTh>
            <SortTh field="next_followup_date">Follow-up</SortTh>
            <SortTh field="updated_at">Activity</SortTh>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <TableGroup
              key={g.label || "all"}
              group={g}
              render={(lead) => {
                const r = lead as AnyRow;
                const Icon = channelIcon(r.channel_id);
                return (
                  <tr
                    key={r.id}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a,button,input,[role=checkbox]")) openLead(r.id);
                    }}
                    className={cn(
                      "group h-10 cursor-pointer transition-colors duration-75 hover:bg-subtle/40 [&>td]:border-b [&>td]:border-border/70",
                      selected.has(r.id) && "bg-info/[0.06] hover:bg-info/[0.08]",
                    )}
                  >
                    <td className="px-3">
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={() => onToggle(r.id)} aria-label={`Select ${r.company_name}`} />
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <LeadLink id={r.id} className="font-semibold tracking-tight hover:underline hover:underline-offset-4">
                        {r.company_name}
                      </LeadLink>
                      <span className="ml-1.5 font-mono text-[11px] text-faint">{r.lead_code}</span>
                      <Link
                        to="/lt/leads/$id"
                        params={{ id: r.id }}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1.5 inline-flex align-middle text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus:opacity-100"
                        title="Open full lead page in a new tab"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="size-3" />
                      </Link>
                    </td>
                    <td className="px-3 whitespace-nowrap text-muted-foreground">{r.primary_contact || "-"}</td>
                    <td className="px-3 whitespace-nowrap text-muted-foreground">{countryLabel(r.country_id)}</td>
                    <td className="px-3">
                      <StagePill stage={findStage(stages, r.stage_id) as any} />
                    </td>
                    <td className="px-3">
                      <Pill tone={(STATUS_TONE[r.status ?? ""] ?? "neutral") as any}>{String(r.status ?? "-").replace(/_/g, " ")}</Pill>
                    </td>
                    <td className="px-3 whitespace-nowrap text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {Icon ? <Icon className="size-3.5" /> : null}
                        {channelName(r.channel_id)}
                      </span>
                    </td>
                    <td className="tabular px-3 text-[12px] whitespace-nowrap text-muted-foreground">{fmtDate(r.date_added)}</td>
                    <td className="tabular px-3 text-[12px] whitespace-nowrap text-muted-foreground">{fmtDate(r.last_contacted_at) || "-"}</td>
                    <td
                      className={cn(
                        "tabular px-3 text-[12px] whitespace-nowrap",
                        r.next_followup_date
                          ? r.next_followup_date < today
                            ? "font-medium text-negative"
                            : r.next_followup_date === today
                              ? "font-medium text-warning"
                              : "text-muted-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {r.next_followup_date === today ? "Today" : fmtDate(r.next_followup_date) || "-"}
                    </td>
                    <td className="tabular px-3 text-[12px] whitespace-nowrap text-muted-foreground">{fmtDate(r.updated_at)}</td>
                  </tr>
                );
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableGroup({ group, render }: { group: { label: string; leads: Lead[] }; render: (l: Lead) => ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!group.label) return <>{group.leads.map(render)}</>;
  return (
    <>
      <tr className="bg-subtle/70">
        <td
          colSpan={11}
          className="cursor-pointer border-b border-border/70 px-3 py-2 text-[12px] font-semibold text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="inline-flex items-center gap-1.5">
            <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
            {group.label}
            <span className="font-mono text-[11px] font-medium text-faint">{group.leads.length}</span>
          </span>
        </td>
      </tr>
      {open && group.leads.map(render)}
    </>
  );
}

const LINK_CLS = "flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-primary transition-colors";

function LeadCardsView({
  leads,
  stages,
  countries,
  channels,
  senderAccounts,
  leadTags,
  selected,
  onToggle,
  groupBy,
}: Lookups & { leads: Lead[]; selected: Set<string>; onToggle: (id: string) => void; groupBy: string }) {
  const countryName = (id: string | null) => countries.find((c) => c.id === id)?.name ?? null;
  const channelName = (id: string | null) => channels.find((c) => c.id === id)?.name ?? null;
  const groups = groupLeads(leads, groupBy, { stages, countries, channels, senderAccounts, leadTags });
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <CardGroup key={g.label || "all"} label={g.label} count={g.leads.length}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.leads.map((lead) => {
              const r = lead as AnyRow;
              const tags = leadTags[r.id] ?? [];
              const country = countryName(r.country_id);
              const channel = channelName(r.channel_id);
              const sentAt = r.email_sent_at || r.last_contacted_at;
              return (
                <div key={r.id} className="pro-card flex flex-col justify-between gap-3 p-4 transition-shadow hover:shadow-subtle">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => onToggle(r.id)} />
                        <StagePill stage={findStage(stages, r.stage_id) as any} />
                      </div>
                      <Pill>{r.status}</Pill>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <LeadLink id={r.id} className="text-[14px] font-semibold tracking-tight text-foreground hover:underline">
                          {r.company_name}
                        </LeadLink>
                        <a
                          href={`/lt/leads/${r.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title="Open lead details in new tab"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        <span>{r.primary_contact || "No contact"}</span>
                        {country && <span> · {country}</span>}
                        {channel && <span> · {channel}</span>}
                      </div>
                    </div>
                    {(r.email_sent || sentAt || r.email_replied) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {sentAt && (
                          <span className="inline-flex items-center gap-1 rounded bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-foreground">
                            <Mail className="size-3 text-primary" /> Sent {fmtDate(sentAt)}
                          </span>
                        )}
                        {!sentAt && r.email_sent && (
                          <span className="inline-flex items-center gap-1 rounded bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-foreground">
                            <CircleCheck className="size-3 text-positive" /> Outreach sent
                          </span>
                        )}
                        {r.email_replied && (
                          <span className="inline-flex items-center gap-1 rounded bg-positive/10 text-positive px-2 py-0.5 text-[11px] font-medium">
                            Replied {r.reply_sentiment ? `(${r.reply_sentiment})` : ""}
                          </span>
                        )}
                      </div>
                    )}
                    {r.personalized_message && (
                      <div className="rounded-md border border-border/80 bg-subtle/60 p-2.5 flex flex-col gap-1 text-[12px]">
                        <div className="flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">
                          <FileText className="size-3 text-primary" /> Personalized Draft
                        </div>
                        <p className="line-clamp-2 text-foreground font-normal leading-relaxed text-[11.5px]">{r.personalized_message}</p>
                      </div>
                    )}
                    {r.message_angle && !r.personalized_message && (
                      <div className="rounded-md border border-border/60 bg-subtle/40 px-2 py-1 text-[11.5px] text-muted-foreground flex items-center gap-1">
                        <span className="font-semibold text-foreground">Hook:</span>
                        <span className="truncate">{r.message_angle}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {r.website_url && (
                        <a
                          href={r.website_url.startsWith("http") ? r.website_url : `https://${r.website_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className={LINK_CLS}
                          title={`Website: ${r.website_url}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="size-3.5" />
                          <span>Website</span>
                        </a>
                      )}
                      {r.company_linkedin_url && (
                        <a href={r.company_linkedin_url} target="_blank" rel="noreferrer" className={LINK_CLS} title="Company LinkedIn" onClick={(e) => e.stopPropagation()}>
                          <Linkedin className="size-3.5 text-[#0a66c2]" />
                        </a>
                      )}
                      {r.instagram_url && (
                        <a
                          href={r.instagram_url.startsWith("http") ? r.instagram_url : `https://instagram.com/${r.instagram_url.replace("@", "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className={LINK_CLS}
                          title="Instagram"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Instagram className="size-3.5 text-[#e4405f]" />
                        </a>
                      )}
                      {r.youtube_url && (
                        <a href={r.youtube_url} target="_blank" rel="noreferrer" className={LINK_CLS} title="YouTube" onClick={(e) => e.stopPropagation()}>
                          <Youtube className="size-3.5 text-[#ff0000]" />
                        </a>
                      )}
                      {r.loom_url && (
                        <a href={r.loom_url} target="_blank" rel="noreferrer" className={LINK_CLS} title="Loom Video" onClick={(e) => e.stopPropagation()}>
                          <Video className="size-3.5 text-[#625df5]" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2.5">
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span key={t} className="rounded bg-muted/60 px-1.5 py-0.2 text-[10.5px] text-muted-foreground">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {fmtDate(r.next_followup_date) ? `Next: ${fmtDate(r.next_followup_date)}` : "No follow-up"}
                      </span>
                      <span>Added {fmtDate(r.date_added)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardGroup>
      ))}
    </div>
  );
}

function CardGroup({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!label) return <>{children}</>;
  return (
    <div className="flex flex-col gap-2">
      <button className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground hover:text-primary w-fit" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▾" : "▸"}</span>
        <span>{label}</span>
        {count !== undefined && <span className="text-[11px] text-muted-foreground font-normal">({count})</span>}
      </button>
      {open && children}
    </div>
  );
}

type ViewMode = "table" | "columns" | "cards" | "calendar";
const VIEWS: ViewMode[] = ["table", "columns", "cards", "calendar"];
const DATE_SORTS = ["updated_at", "last_contacted_at", "next_followup_date", "date_added"];
const DATE_SORT_LABEL: Record<string, string> = {
  updated_at: "last activity",
  last_contacted_at: "last contacted date",
  next_followup_date: "follow-up date",
  date_added: "date added",
};
const toLocalDay = (v: string) => localISODate(new Date(v));
const PAGE_SIZES = [50, 100, 150, 200, 300, 400, 500];
const MAX_PAGE_SIZE = 500;

function LeadsPage() {
  const { can, isAdmin, profile } = useAuth() as any;
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [customOpen, setCustomOpen] = useState(false);
  const [customSize, setCustomSize] = useState("");
  const [sortField, setSortField] = useState("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupBy, setGroupBy] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const defaultView = profile?.default_lead_view;

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LEAD_VIEW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (stored && VIEWS.includes(stored as ViewMode)) return setView(stored as ViewMode);
    setView(viewFromProfileDefault(defaultView));
  }, [defaultView]);

  const changeView = (v: ViewMode) => {
    setView(v);
    try {
      window.localStorage.setItem(LEAD_VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const { data: stages } = useStages("lead");
  const { data: countries } = useCountries();
  const { data: channels } = useChannels();
  const { data: senderAccounts } = useSenderAccounts();
  const { data: tags } = useTags();

  const orderCol =
    sortField === "country" ? "country_id" : sortField === "stage" ? "stage_id" : sortField === "primary_contact" ? "primary_contact" : sortField;

  const applyFilters = (q: any) => {
    const f = filters;
    if (f.search) q = q.or(`company_name.ilike.%${f.search}%,primary_contact.ilike.%${f.search}%,lead_code.ilike.%${f.search}%`);
    if (f.stageId) q = q.eq("stage_id", f.stageId);
    if (f.countryId) q = q.eq("country_id", f.countryId);
    if (f.channelId) q = q.eq("channel_id", f.channelId);
    if (f.senderAccountId) q = q.eq("sender_account_id", f.senderAccountId);
    if (f.status) q = q.eq("status", f.status);
    if (f.dateFrom) q = q.gte("date_added", f.dateFrom);
    if (f.dateTo) q = q.lte("date_added", f.dateTo);
    if (f.hasReplied === "yes") q = q.eq("email_replied", true);
    if (f.hasReplied === "no") q = q.eq("email_replied", false);
    if (f.hasLoomSent === "yes") q = q.eq("loom_sent", true);
    if (f.hasLoomSent === "no") q = q.eq("loom_sent", false);
    q = applyWhen(q, f);
    q = q.eq("archived", false);
    return q;
  };

  const { data: tagLeadIds } = useQuery({
    queryKey: ["lead-tags-filter", filters.tagId],
    queryFn: async () => {
      if (!filters.tagId) return null;
      const { data } = await supabase.from("lead_tags").select("lead_id").eq("tag_id", filters.tagId);
      return (data ?? []).map((r: AnyRow) => r.lead_id as string);
    },
  });

  const { data: tableData, isLoading } = useQuery({
    queryKey: ["leads-table", filters, page, pageSize, orderCol, sortDir, tagLeadIds],
    queryFn: async () => {
      let q: any = supabase.from("leads").select("*", { count: "exact" });
      q = applyFilters(q);
      if (filters.tagId) {
        if (!tagLeadIds || tagLeadIds.length === 0) return { rows: [] as Lead[], count: 0 };
        q = q.in("id", tagLeadIds);
      }
      q = q.order(orderCol, { ascending: sortDir === "asc", nullsFirst: false }).range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Lead[], count: (count ?? 0) as number };
    },
    enabled: view === "table" || view === "cards",
  });

  const { data: boardLeads } = useQuery({
    queryKey: ["leads-board", filters, tagLeadIds, view, month, orderCol, sortDir],
    queryFn: async () => {
      let q: any = supabase.from("leads").select("*").limit(1000);
      q = applyFilters(q);
      q = q.order(orderCol, { ascending: sortDir === "asc", nullsFirst: false });
      if (filters.tagId) {
        if (!tagLeadIds || tagLeadIds.length === 0) return [] as Lead[];
        q = q.in("id", tagLeadIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    enabled: view === "columns" || view === "calendar",
  });

  const { data: leadTags } = useQuery({
    queryKey: ["lead-tags-map"],
    queryFn: async () => {
      const { data } = await supabase.from("lead_tags").select("lead_id,tags(name)");
      const out: Record<string, string[]> = {};
      (data ?? []).forEach((r: AnyRow) => {
        out[r.lead_id] = out[r.lead_id] ?? [];
        if (r.tags?.name) out[r.lead_id].push(r.tags.name);
      });
      return out;
    },
  });

  const rows = tableData?.rows ?? [];
  const count = tableData?.count ?? 0;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = (ids: string[]) =>
    setSelected((s) => {
      const all = ids.every((id) => s.has(id));
      const n = new Set(s);
      ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });
  const onSort = (f: string) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
  };

  const ids = () => Array.from(selected);
  const bulkStage = async (stageId: string) => {
    await supabase.from("leads").update({ stage_id: stageId } as never).in("id", ids());
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    qc.invalidateQueries({ queryKey: ["leads-board"] });
    setSelected(new Set());
  };
  const bulkArchive = async () => {
    await supabase.from("leads").update({ archived: true, archived_at: new Date().toISOString() } as never).in("id", ids());
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    setSelected(new Set());
  };
  const bulkPushCrm = async () => {
    for (const id of selected) await supabase.rpc("ensure_crm_record" as never, { _lead_id: id } as never);
    setSelected(new Set());
  };
  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} lead(s)? This cannot be undone.`)) return;
    await supabase.from("leads").delete().in("id", ids());
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    setSelected(new Set());
  };
  const exportCsv = () => {
    const sel = rows.filter((r) => selected.has(r.id)) as AnyRow[];
    downloadCsv("leads.csv", [
      ["lead_code", "company_name", "primary_contact", "status", "date_added"],
      ...sel.map((r) => [r.lead_code, r.company_name, r.primary_contact, r.status, r.date_added]),
    ]);
  };
  const bulkFollowup = async () => {
    const d = window.prompt("Follow-up date (YYYY-MM-DD)", todayISO());
    if (!d) return;
    await supabase.from("leads").update({ next_followup_date: d } as never).in("id", ids());
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    setSelected(new Set());
  };

  const columns = (stages ?? []).map((s) => ({ stage: s, leads: (boardLeads ?? []).filter((l) => l.stage_id === s.id) }));
  const dateKey = DATE_SORTS.includes(sortField) ? sortField : "date_added";
  const leadDay = (l: AnyRow) => {
    const v = l[dateKey];
    return v ? (v.length <= 10 ? v : toLocalDay(v)) : "";
  };
  const isDaySelected = (d: string) =>
    dateKey === "date_added"
      ? filters.dateFrom === d && filters.dateTo === d
      : filters.whenField === dateKey && filters.whenRange === "custom" && filters.whenFrom === d && filters.whenTo === d;
  const pickDay = (d: string) => {
    setPage(0);
    setFilters(
      dateKey === "date_added"
        ? (f) => ({ ...f, dateFrom: d, dateTo: d })
        : (f) => ({ ...f, whenField: dateKey, whenRange: "custom", whenFrom: d, whenTo: d }),
    );
  };
  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const out: { date: string; count: number }[] = [];
    const pad = (first.getDay() + 6) % 7;
    for (let i = 0; i < pad; i++) out.push({ date: "", count: 0 });
    const n = new Date(y, m, 0).getDate();
    for (let d = 1; d <= n; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      out.push({ date: iso, count: (boardLeads ?? []).filter((l) => leadDay(l as AnyRow) === iso).length });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardLeads, month, dateKey]);

  const lookups = {
    stages: stages ?? [],
    countries: countries ?? [],
    channels: channels ?? [],
    senderAccounts: senderAccounts ?? [],
    leadTags: leadTags ?? {},
  } as Lookups;

  const pager = (extra = "") => (
    <div className={cn("flex items-center justify-between", extra)}>
      <span className="label-text">
        {count} leads · page {page + 1} of {Math.max(1, Math.ceil(count / pageSize))}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= count} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // TODO: live passes guide="leads" actionsInHeader={false}; repo AppPage lacks those props 
  return (
    <AppPage module="lead" title="Leads" perm="lead.leads">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 rounded-[10px] border border-border bg-subtle p-[3px]">
            {VIEWS.map((v) => {
              const Icon = v === "table" ? TableIcon : v === "columns" ? Columns3 : v === "cards" ? LayoutGrid : CalendarDays;
              return (
                <button
                  key={v}
                  className={cn(
                    "pressable flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12.5px] font-medium capitalize transition-colors",
                    view === v ? "bg-surface text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => changeView(v)}
                >
                  <Icon className="size-3.5" strokeWidth={1.75} />
                  {v}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can?.("lead.lead_create") && (
              <Link to="/lt/leads/$id" params={{ id: "new" }}>
                <Button size="sm">
                  <Plus />
                  Add lead
                </Button>
              </Link>
            )}
            {(view === "table" || view === "cards") && (
              <Select
                value={PAGE_SIZES.includes(pageSize) ? String(pageSize) : "__custom"}
                onValueChange={(v) => {
                  if (v === "__custom") {
                    setCustomSize(String(pageSize));
                    setCustomOpen(true);
                    return;
                  }
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger className="h-8 w-[130px] min-w-0 text-[13px]">
                  <SelectValue placeholder="Per page" />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} per page
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom">Custom{PAGE_SIZES.includes(pageSize) ? "" : ` (${pageSize})`}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {(view === "table" || view === "cards") && (
              <Select value={groupBy || "__none"} onValueChange={(v) => setGroupBy(v === "__none" ? "" : v)}>
                <SelectTrigger className="h-8 w-[160px] min-w-0 text-[13px]">
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No grouping</SelectItem>
                  <SelectItem value="country">Country</SelectItem>
                  <SelectItem value="stage">Stage</SelectItem>
                  <SelectItem value="channel">Channel</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="followup">Follow-up bucket</SelectItem>
                  <SelectItem value="date_added">Date added</SelectItem>
                  <SelectItem value="tag">Tag</SelectItem>
                  <SelectItem value="sender_account">Sender account</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <LeadFilters
          filters={filters}
          onChange={(f) => {
            setFilters(f);
            setPage(0);
          }}
          stages={stages ?? []}
          countries={countries ?? []}
          channels={channels ?? []}
          senderAccounts={senderAccounts ?? []}
          tags={tags ?? []}
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={(f, d) => {
            setSortField(f);
            setSortDir(d);
            setPage(0);
          }}
        />

        {selected.size > 0 && (
          <div className="pro-card flex w-full animate-in flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-xs fade-in-0 duration-200">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-subtle px-3 py-1.5">
                <SquareCheckBig className="size-4 text-primary" />
                <span className="text-[13px] font-semibold tabular text-foreground">
                  {selected.size} {selected.size === 1 ? "lead" : "leads"} selected
                </span>
              </div>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
                <X className="mr-1 size-3.5" />
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select onValueChange={bulkStage}>
                <SelectTrigger className="h-8 w-[150px] text-[13px]">
                  <SelectValue placeholder="Change stage" />
                </SelectTrigger>
                <SelectContent>
                  {(stages ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 text-[13px]" onClick={bulkFollowup}>
                <Calendar className="mr-1.5 size-3.5 text-muted-foreground" />
                Set follow-up
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[13px]" onClick={bulkPushCrm}>
                <Upload className="mr-1.5 size-3.5 text-muted-foreground" />
                Push to CRM
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[13px]" onClick={bulkArchive}>
                <Archive className="mr-1.5 size-3.5 text-muted-foreground" />
                Archive
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[13px]" onClick={exportCsv}>
                <DownloadIcon className="mr-1.5 size-3.5 text-muted-foreground" />
                Export CSV
              </Button>
              {isAdmin && (
                <Button size="sm" variant="destructive" className="h-8 text-[13px]" onClick={bulkDelete}>
                  <Trash2 className="mr-1.5 size-3.5" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}

        {isLoading && (view === "table" || view === "cards") ? (
          <Loading />
        ) : view === "table" ? (
          rows.length === 0 ? (
            <EmptyState title="No leads found" hint="Try adjusting filters." />
          ) : (
            <>
              <LeadsTable
                leads={rows}
                {...lookups}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                groupBy={groupBy}
              />
              <div className="md:hidden">
                <LeadCardsView leads={rows} {...lookups} selected={selected} onToggle={toggle} groupBy={groupBy} />
              </div>
              {pager()}
            </>
          )
        ) : view === "cards" ? (
          rows.length === 0 ? (
            <EmptyState title="No leads found" hint="Try adjusting filters." />
          ) : (
            <>
              <LeadCardsView leads={rows} {...lookups} selected={selected} onToggle={toggle} groupBy={groupBy} />
              {pager("pt-2")}
            </>
          )
        ) : view === "columns" ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map(({ stage, leads }) => (
              <div
                key={stage.id}
                className="w-[280px] shrink-0 rounded-xl border border-border/60 bg-subtle/40 p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  const id = e.dataTransfer.getData("text/lead-id");
                  if (!id) return;
                  await supabase.from("leads").update({ stage_id: stage.id } as never).eq("id", id);
                  qc.invalidateQueries({ queryKey: ["leads-board"] });
                }}
              >
                <div className="mb-2 flex items-center justify-between text-[12px] font-medium" style={{ color: stage.color }}>
                  <span>{stage.name}</span>
                  <span>{leads.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {leads.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/lead-id", l.id)}
                      className="cursor-grab pro-card p-2 text-[13px]"
                    >
                      <Link to="/lt/leads/$id" params={{ id: l.id }} className="font-medium hover:underline">
                        {l.company_name}
                      </Link>
                      <div className="label-text">
                        {dateKey === "date_added"
                          ? `Added ${fmtDate(l.date_added)}`
                          : `${DATE_SORT_LABEL[dateKey].replace(/^./, (c) => c.toUpperCase())}: ${leadDay(l as AnyRow) ? fmtDate(leadDay(l as AnyRow)) : "none"}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => shiftMonth(-1)}>
                Prev
              </Button>
              <div className="text-center">
                <div className="text-[13px] font-medium">{month}</div>
                <div className="label-text">By {DATE_SORT_LABEL[dateKey]} (change in Filters, Sort by)</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMonth(todayISO().slice(0, 7))}>
                  Today
                </Button>
                <Button size="sm" variant="outline" onClick={() => shiftMonth(1)}>
                  Next
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    "min-h-16 rounded-lg border border-border/80 p-1 text-[12px]",
                    d.date && isDaySelected(d.date) ? "bg-subtle" : "",
                    d.date ? "cursor-pointer hover:bg-subtle" : "",
                  )}
                  onClick={() => d.date && pickDay(d.date)}
                >
                  {d.date && <div className="text-muted-foreground">{d.date.slice(-2)}</div>}
                  {d.count > 0 && <div className="mt-1 font-medium text-info">{d.count}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom page size</DialogTitle>
            <DialogDescription>Choose how many leads to show per page (1 to {MAX_PAGE_SIZE}).</DialogDescription>
          </DialogHeader>
          <Input type="number" min={1} max={MAX_PAGE_SIZE} value={customSize} onChange={(e) => setCustomSize(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const n = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(customSize) || 0)));
                if (n) {
                  setPageSize(n);
                  setPage(0);
                  setCustomOpen(false);
                }
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
