import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useStages, useChannels, useCountries, useSenderAccounts, useTags } from "@/hooks/useLookups";
import { downloadCsv, fmtDate, todayISO } from "@/lib/format";
import { LeadFilterBar } from "@/components/leads/LeadFilterBar";
import { LeadTable, type SortField } from "@/components/leads/LeadTable";
import { LeadCards } from "@/components/leads/LeadCards";
import { EMPTY_FILTERS, type LeadFilters } from "@/components/leads/filters";
import type { GroupByKey } from "@/components/leads/groups";
import type { Lead } from "@/components/leads/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lt/leads/")({
  head: () => ({
    meta: [
      { title: "Leads | Lead Tracker" },
      { name: "description", content: "Search, filter and manage every lead in the pipeline." },
      { property: "og:title", content: "Leads | Lead Tracker" },
      { property: "og:description", content: "Search, filter and manage every lead in the pipeline." },
    ],
  }),
  component: LeadsPage,
});

type ViewMode = "table" | "columns" | "cards" | "calendar";
const PAGE_SIZE = 50;

function LeadsPage() {
  const { can, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupBy, setGroupBy] = useState<GroupByKey>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calMonth, setCalMonth] = useState(() => todayISO().slice(0, 7));

  useEffect(() => {
    const v = window.localStorage.getItem("lt.leads.view");
    if (v) setView(v as ViewMode);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("lt.leads.view", view);
  }, [view]);

  const { data: stages } = useStages("lead");
  const { data: countries } = useCountries();
  const { data: channels } = useChannels();
  const { data: senderAccounts } = useSenderAccounts();
  const { data: tags } = useTags();

  const sortColumn = sortField === "country" ? "country_id" : sortField === "stage" ? "stage_id" : sortField === "primary_contact" ? "primary_contact" : sortField;

  const applyFilters = (q: any) => {
    if (filters.search) q = q.or(`company_name.ilike.%${filters.search}%,primary_contact.ilike.%${filters.search}%,lead_code.ilike.%${filters.search}%`);
    if (filters.stageId) q = q.eq("stage_id", filters.stageId);
    if (filters.countryId) q = q.eq("country_id", filters.countryId);
    if (filters.channelId) q = q.eq("channel_id", filters.channelId);
    if (filters.senderAccountId) q = q.eq("sender_account_id", filters.senderAccountId);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.dateFrom) q = q.gte("date_added", filters.dateFrom);
    if (filters.dateTo) q = q.lte("date_added", filters.dateTo);
    if (filters.hasReplied === "yes") q = q.eq("email_replied", true);
    if (filters.hasReplied === "no") q = q.eq("email_replied", false);
    if (filters.hasLoomSent === "yes") q = q.eq("loom_sent", true);
    if (filters.hasLoomSent === "no") q = q.eq("loom_sent", false);
    q = q.eq("archived", false);
    return q;
  };

  const { data: tagLeadIds } = useQuery({
    queryKey: ["lead-tags-filter", filters.tagId],
    queryFn: async () => {
      if (!filters.tagId) return null;
      const { data } = await supabase.from("lead_tags").select("lead_id").eq("tag_id", filters.tagId);
      return (data ?? []).map((r) => r.lead_id);
    },
  });

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["leads-table", filters, page, sortColumn, sortDir, tagLeadIds],
    queryFn: async () => {
      let q = supabase.from("leads").select("*", { count: "exact" });
      q = applyFilters(q);
      if (filters.tagId) {
        if (!tagLeadIds || tagLeadIds.length === 0) return { rows: [], count: 0 };
        q = q.in("id", tagLeadIds);
      }
      q = q.order(sortColumn, { ascending: sortDir === "asc" }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Lead[], count: count ?? 0 };
    },
    enabled: view === "table" || view === "cards",
  });

  const { data: boardData } = useQuery({
    queryKey: ["leads-board", filters, tagLeadIds, view, calMonth],
    queryFn: async () => {
      let q = supabase.from("leads").select("*").limit(1000);
      q = applyFilters(q);
      if (filters.tagId) {
        if (!tagLeadIds || tagLeadIds.length === 0) return [];
        q = q.in("id", tagLeadIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    enabled: view === "columns" || view === "calendar",
  });

  const { data: leadTagsMap } = useQuery({
    queryKey: ["lead-tags-map"],
    queryFn: async () => {
      const { data } = await supabase.from("lead_tags").select("lead_id,tags(name)");
      const map: Record<string, string[]> = {};
      (data ?? []).forEach((r: any) => {
        map[r.lead_id] = map[r.lead_id] ?? [];
        if (r.tags?.name) map[r.lead_id].push(r.tags.name);
      });
      return map;
    },
  });

  const rows = pageData?.rows ?? [];
  const count = pageData?.count ?? 0;

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (ids: string[]) => {
    setSelected((s) => {
      const allIn = ids.every((id) => s.has(id));
      const next = new Set(s);
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const onSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
  };

  const bulkChangeStage = async (stageId: string) => {
    await supabase.from("leads").update({ stage_id: stageId }).in("id", Array.from(selected));
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    qc.invalidateQueries({ queryKey: ["leads-board"] });
    setSelected(new Set());
  };
  const bulkArchive = async () => {
    await supabase.from("leads").update({ archived: true, archived_at: new Date().toISOString() }).in("id", Array.from(selected));
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    setSelected(new Set());
  };
  const bulkPushCrm = async () => {
    for (const id of selected) await supabase.rpc("ensure_crm_record", { _lead_id: id });
    setSelected(new Set());
  };
  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} lead(s)? This cannot be undone.`)) return;
    await supabase.from("leads").delete().in("id", Array.from(selected));
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    setSelected(new Set());
  };
  const bulkExport = () => {
    const sel = rows.filter((r) => selected.has(r.id));
    downloadCsv("leads.csv", [
      ["lead_code", "company_name", "primary_contact", "status", "date_added"],
      ...sel.map((l) => [l.lead_code, l.company_name, l.primary_contact, l.status, l.date_added]),
    ]);
  };
  const bulkSetFollowup = async () => {
    const d = window.prompt("Follow-up date (YYYY-MM-DD)", todayISO());
    if (!d) return;
    await supabase.from("leads").update({ next_followup_date: d }).in("id", Array.from(selected));
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    setSelected(new Set());
  };

  const stageColumns = (stages ?? []).map((s) => ({ stage: s, leads: (boardData ?? []).filter((l) => l.stage_id === s.id) }));

  const calDays = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const days: { date: string; count: number }[] = [];
    const startOffset = (first.getDay() + 6) % 7;
    for (let i = 0; i < startOffset; i++) days.push({ date: "", count: 0 });
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date: iso, count: (boardData ?? []).filter((l) => l.date_added === iso).length });
    }
    return days;
  }, [boardData, calMonth]);

  return (
    <AppPage
      module="lead"
      title="Leads"
      perm="lead.leads"
      actions={can("lead.lead_create") ? <Link to="/lt/leads/$id" params={{ id: "new" }}><Button size="sm">Add lead</Button></Link> : null}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {(["table", "columns", "cards", "calendar"] as ViewMode[]).map((v) => (
              <button key={v} className={cn("rounded px-2.5 py-1 text-[13px] capitalize", view === v ? "bg-subtle font-medium" : "text-muted-foreground")} onClick={() => setView(v)}>
                {v}
              </button>
            ))}
          </div>
          {(view === "table" || view === "cards") && (
            <Select value={groupBy || "__none"} onValueChange={(v) => setGroupBy(v === "__none" ? "" : (v as GroupByKey))}>
              <SelectTrigger className="h-8 w-[180px] text-[13px]"><SelectValue placeholder="Group by" /></SelectTrigger>
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

        <LeadFilterBar
          filters={filters}
          onChange={(f) => { setFilters(f); setPage(0); }}
          stages={stages ?? []}
          countries={countries ?? []}
          channels={channels ?? []}
          senderAccounts={senderAccounts ?? []}
          tags={tags ?? []}
        />

        {selected.size > 0 && (
          <Card className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">{selected.size} selected</span>
            <Select onValueChange={bulkChangeStage}>
              <SelectTrigger className="h-8 w-[150px] text-[13px]"><SelectValue placeholder="Change stage" /></SelectTrigger>
              <SelectContent>{(stages ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={bulkSetFollowup}>Set follow-up</Button>
            <Button size="sm" variant="outline" onClick={bulkPushCrm}>Push to CRM</Button>
            <Button size="sm" variant="outline" onClick={bulkArchive}>Archive</Button>
            <Button size="sm" variant="outline" onClick={bulkExport}>Export CSV</Button>
            {isAdmin && <Button size="sm" variant="destructive" onClick={bulkDelete}>Delete</Button>}
          </Card>
        )}

        {isLoading && (view === "table" || view === "cards") ? (
          <Loading />
        ) : view === "table" ? (
          rows.length === 0 ? <EmptyState title="No leads found" hint="Try adjusting filters." /> : (
            <>
              <LeadTable
                leads={rows}
                stages={stages ?? []}
                countries={countries ?? []}
                channels={channels ?? []}
                senderAccounts={senderAccounts ?? []}
                leadTags={leadTagsMap ?? {}}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                sortField={sortField}
                sortDir={sortDir}
                onSort={onSort}
                groupBy={groupBy}
              />
              <div className="md:hidden">
                <LeadCards leads={rows} stages={stages ?? []} countries={countries ?? []} channels={channels ?? []} senderAccounts={senderAccounts ?? []} leadTags={leadTagsMap ?? {}} selected={selected} onToggle={toggle} groupBy={groupBy} />
              </div>
              <div className="flex items-center justify-between">
                <span className="label-text">{count} leads · page {page + 1} of {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= count} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )
        ) : view === "cards" ? (
          <LeadCards leads={rows} stages={stages ?? []} countries={countries ?? []} channels={channels ?? []} senderAccounts={senderAccounts ?? []} leadTags={leadTagsMap ?? {}} selected={selected} onToggle={toggle} groupBy={groupBy} />
        ) : view === "columns" ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {stageColumns.map(({ stage, leads }) => (
              <div
                key={stage.id}
                className="w-64 shrink-0 rounded-lg border border-border bg-subtle p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  const id = e.dataTransfer.getData("text/lead-id");
                  if (!id) return;
                  await supabase.from("leads").update({ stage_id: stage.id }).eq("id", id);
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
                      className="cursor-grab rounded-md border border-border bg-card p-2 text-[13px]"
                    >
                      <Link to="/lt/leads/$id" params={{ id: l.id }} className="font-medium hover:underline">{l.company_name}</Link>
                      <div className="label-text">{fmtDate(l.date_added)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => { const [y, m] = calMonth.split("-").map(Number); const d = new Date(y, m - 2, 1); setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }}>Prev</Button>
              <span className="text-[13px] font-medium">{calMonth}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setCalMonth(todayISO().slice(0, 7))}>Today</Button>
                <Button size="sm" variant="outline" onClick={() => { const [y, m] = calMonth.split("-").map(Number); const d = new Date(y, m, 1); setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }}>Next</Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calDays.map((d, i) => (
                <div
                  key={i}
                  className={cn("min-h-16 rounded-md border border-border p-1 text-[12px]", d.date && filters.dateFrom === d.date ? "bg-subtle" : "")}
                  onClick={() => d.date && setFilters((f) => ({ ...f, dateFrom: d.date, dateTo: d.date }))}
                >
                  {d.date && <div className="text-muted-foreground">{d.date.slice(-2)}</div>}
                  {d.count > 0 && <div className="mt-1 font-medium text-info">{d.count}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppPage>
  );
}
