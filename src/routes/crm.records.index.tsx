import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, LayoutGrid, Columns3, Table2 } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { Card, Dot, EmptyState, Loading, Pill } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles, useStages } from "@/hooks/useLookups";
import { money, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PRIORITY_COLORS, PRIORITY_LABELS, DEAL_TYPE_LABELS, type CrmRecordRow } from "@/components/crm/helpers";

export const Route = createFileRoute("/crm/records/")({
  head: () => ({
    meta: [
      { title: "Records — CRM — Buzzspear Tracker" },
      { name: "description", content: "All CRM deal records with stage, value and owner." },
      { property: "og:title", content: "Records — CRM — Buzzspear Tracker" },
      { property: "og:description", content: "All CRM deal records with stage, value and owner." },
    ],
  }),
  component: RecordsPage,
});

const PAGE_SIZE = 50;
type ViewMode = "table" | "columns" | "cards";

type SortKey =
  | "company"
  | "contact"
  | "stage"
  | "priority"
  | "estimated_value"
  | "deal_type"
  | "expected_close_date"
  | "last_contacted_at"
  | "next_followup_date"
  | "owner";

const SORT_MAP: Record<SortKey, { column: string; foreignTable?: string }> = {
  company: { column: "company_name", foreignTable: "leads" },
  contact: { column: "primary_contact", foreignTable: "leads" },
  stage: { column: "stage_id" },
  priority: { column: "priority" },
  estimated_value: { column: "estimated_value" },
  deal_type: { column: "deal_type" },
  expected_close_date: { column: "expected_close_date" },
  last_contacted_at: { column: "last_contacted_at" },
  next_followup_date: { column: "next_followup_date" },
  owner: { column: "owner_id" },
};

function RecordsPage() {
  const navigate = useNavigate();
  const { data: stages } = useStages("crm");
  const { data: profiles } = useProfiles();

  const [view, setView] = useState<ViewMode>("table");
  useEffect(() => {
    const v = window.localStorage.getItem("bs.crm.records.view");
    if (v === "table" || v === "columns" || v === "cards") setView(v);
  }, []);
  const setViewPersist = (v: ViewMode) => {
    setView(v);
    window.localStorage.setItem("bs.crm.records.view", v);
  };

  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("next_followup_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [stageFilter, setStageFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [dealTypeFilter, setDealTypeFilter] = useState<string>("all");
  const [closeMonth, setCloseMonth] = useState<string>("");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");

  useEffect(() => {
    setPage(0);
  }, [stageFilter, priorityFilter, ownerFilter, dealTypeFilter, closeMonth, minValue, maxValue]);

  const stageMap = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);
  const profileMap = useMemo(() => new Map((profiles ?? []).map((p: any) => [p.id, p])), [profiles]);

  const applyFilters = (q: any) => {
    if (stageFilter !== "all") q = q.eq("stage_id", stageFilter);
    if (priorityFilter !== "all") q = q.eq("priority", priorityFilter);
    if (ownerFilter !== "all") q = q.eq("owner_id", ownerFilter);
    if (dealTypeFilter !== "all") q = q.eq("deal_type", dealTypeFilter);
    if (closeMonth) {
      const [y, m] = closeMonth.split("-").map(Number);
      const from = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const to = new Date(y, m, 0).toISOString().slice(0, 10);
      q = q.gte("expected_close_date", from).lte("expected_close_date", to);
    }
    if (minValue) q = q.gte("estimated_value", Number(minValue));
    if (maxValue) q = q.lte("estimated_value", Number(maxValue));
    return q;
  };

  const isColumnsView = view === "columns";

  const { data, isLoading } = useQuery({
    queryKey: [
      "crm_records",
      view,
      page,
      sortKey,
      sortDir,
      stageFilter,
      priorityFilter,
      ownerFilter,
      dealTypeFilter,
      closeMonth,
      minValue,
      maxValue,
    ],
    queryFn: async () => {
      const sel =
        "*, leads!inner(id,company_name,lead_code,primary_contact,lead_contacts(email,linkedin_url,is_primary))";
      let q = supabase.from("crm_records").select(sel, { count: "exact" });
      q = applyFilters(q);
      const sort = SORT_MAP[sortKey];
      q = q.order(sort.column, { ascending: sortDir === "asc", foreignTable: sort.foreignTable as any });
      if (!isColumnsView) {
        q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      } else {
        q = q.limit(1000);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as CrmRecordRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const primaryEmail = (r: CrmRecordRow) => {
    const contacts = (r.leads as any)?.lead_contacts ?? [];
    const primary = contacts.find((c: any) => c.is_primary) ?? contacts[0];
    return primary?.email ?? "";
  };

  const ownerName = (id: string | null) => {
    if (!id) return "";
    const p = profileMap.get(id);
    return p?.full_name || p?.email || "";
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortField)}
      className="flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {sortKey === sortField ? (
        sortDir === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 opacity-30" />
      )}
    </button>
  );

  const openRecord = (id: string) => navigate({ to: "/crm/records/$id", params: { id } });

  const renderRow = (r: CrmRecordRow) => {
    const stage = r.stage_id ? stageMap.get(r.stage_id) : undefined;
    return (
      <tr
        key={r.id}
        onClick={() => openRecord(r.id)}
        className="h-9 cursor-pointer border-b border-border text-[13px] hover:bg-subtle"
      >
        <td className="px-3">{r.leads?.company_name}</td>
        <td className="px-3">{r.leads?.primary_contact}</td>
        <td className="px-3">{primaryEmail(r)}</td>
        <td className="px-3">
          <Pill color={stage?.color}>{stage?.name ?? "-"}</Pill>
        </td>
        <td className="px-3">
          <span className="flex items-center gap-1.5">
            <Dot color={PRIORITY_COLORS[r.priority]} />
            {PRIORITY_LABELS[r.priority] ?? r.priority}
          </span>
        </td>
        <td className="px-3">{money(r.estimated_value, r.currency)}</td>
        <td className="px-3">{DEAL_TYPE_LABELS[r.deal_type] ?? r.deal_type}</td>
        <td className="px-3">{fmtDate(r.expected_close_date)}</td>
        <td className="px-3">{fmtDate(r.last_contacted_at)}</td>
        <td className="px-3">{fmtDate(r.next_followup_date)}</td>
        <td className="px-3">{ownerName(r.owner_id)}</td>
      </tr>
    );
  };

  const renderCard = (r: CrmRecordRow) => {
    const stage = r.stage_id ? stageMap.get(r.stage_id) : undefined;
    return (
      <button
        key={r.id}
        onClick={() => openRecord(r.id)}
        className="w-full rounded-lg border border-border bg-card p-3 text-left hover:bg-subtle"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] font-medium">{r.leads?.company_name}</div>
          <Pill color={stage?.color}>{stage?.name ?? "-"}</Pill>
        </div>
        <div className="mt-1 text-[12px] text-muted-foreground">{r.leads?.primary_contact}</div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-1.5">
            <Dot color={PRIORITY_COLORS[r.priority]} />
            {PRIORITY_LABELS[r.priority]}
          </span>
          <span>{money(r.estimated_value, r.currency)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Next: {fmtDate(r.next_followup_date) || "-"}</span>
          <span>{ownerName(r.owner_id)}</span>
        </div>
      </button>
    );
  };

  const filtersBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={stageFilter} onValueChange={setStageFilter}>
        <SelectTrigger className="h-8 w-[140px] text-[12px]">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stages</SelectItem>
          {(stages ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={priorityFilter} onValueChange={setPriorityFilter}>
        <SelectTrigger className="h-8 w-[120px] text-[12px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
      <Select value={ownerFilter} onValueChange={setOwnerFilter}>
        <SelectTrigger className="h-8 w-[140px] text-[12px]">
          <SelectValue placeholder="Owner" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All owners</SelectItem>
          {(profiles ?? []).map((p: any) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name || p.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={dealTypeFilter} onValueChange={setDealTypeFilter}>
        <SelectTrigger className="h-8 w-[130px] text-[12px]">
          <SelectValue placeholder="Deal type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All deal types</SelectItem>
          <SelectItem value="one_time">One time</SelectItem>
          <SelectItem value="retainer">Retainer</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="month"
        value={closeMonth}
        onChange={(e) => setCloseMonth(e.target.value)}
        className="h-8 w-[150px] text-[12px]"
      />
      <Input
        type="number"
        placeholder="Min value"
        value={minValue}
        onChange={(e) => setMinValue(e.target.value)}
        className="h-8 w-[110px] text-[12px]"
      />
      <Input
        type="number"
        placeholder="Max value"
        value={maxValue}
        onChange={(e) => setMaxValue(e.target.value)}
        className="h-8 w-[110px] text-[12px]"
      />
    </div>
  );

  const viewSwitch = (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {(
        [
          { key: "table", icon: Table2 },
          { key: "columns", icon: Columns3 },
          { key: "cards", icon: LayoutGrid },
        ] as const
      ).map((v) => (
        <button
          key={v.key}
          onClick={() => setViewPersist(v.key)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-[12px]",
            view === v.key ? "bg-subtle text-foreground" : "text-muted-foreground",
          )}
        >
          <v.icon className="size-3.5" />
        </button>
      ))}
    </div>
  );

  return (
    <AppPage module="crm" title="Records" perm="crm.records" actions={viewSwitch}>
      <div className="flex flex-col gap-4">
        <Card>{filtersBar}</Card>

        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState title="No CRM records" hint="Records appear here once a lead is marked replied." />
        ) : view === "table" ? (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
                <tr className="h-9 border-b border-border">
                  <th className="px-3 font-medium"><SortHeader label="Company" sortField="company" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Contact" sortField="contact" /></th>
                  <th className="px-3 font-medium">Email</th>
                  <th className="px-3 font-medium"><SortHeader label="Stage" sortField="stage" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Priority" sortField="priority" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Value" sortField="estimated_value" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Deal type" sortField="deal_type" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Expected close" sortField="expected_close_date" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Last contacted" sortField="last_contacted_at" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Next follow-up" sortField="next_followup_date" /></th>
                  <th className="px-3 font-medium"><SortHeader label="Owner" sortField="owner" /></th>
                </tr>
              </thead>
              <tbody>{rows.map(renderRow)}</tbody>
            </table>
          </Card>
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(renderCard)}</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {(stages ?? []).map((s) => {
              const stageRows = rows.filter((r) => r.stage_id === s.id);
              return (
                <div key={s.id} className="w-[280px] shrink-0 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <Pill color={s.color}>{s.name}</Pill>
                    <span className="text-[11px] text-muted-foreground">{stageRows.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    {stageRows.length === 0 ? (
                      <div className="p-3 text-center text-[12px] text-muted-foreground">Empty</div>
                    ) : (
                      stageRows.map(renderCard)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isColumnsView && rows.length > 0 && (
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              Page {page + 1} of {totalPages} ({count} records)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppPage>
  );
}
