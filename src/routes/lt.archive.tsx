import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppPage } from "@/components/app-shell";
import { Card, EmptyState, Loading, fmtDate } from "@/components/live/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useStages, useCountries } from "@/hooks/useLookups";
import type { Lead } from "@/components/leads/types";

export const Route = createFileRoute("/lt/archive")({
  head: () => ({
    meta: [
      { title: "Archive | Lead Tracker" },
      { name: "description", content: "Archived leads with restore and delete actions." },
      { property: "og:title", content: "Archive | Lead Tracker" },
      { property: "og:description", content: "Archived leads with restore and delete actions." },
    ],
  }),
  component: ArchivePage,
});

const PAGE_SIZE = 50;

function ArchivePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: stages } = useStages("lead");
  const { data: countries } = useCountries();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["archived-leads", search, page],
    queryFn: async () => {
      let q = supabase.from("leads").select("*", { count: "exact" }).eq("archived", true);
      if (search) q = q.or(`company_name.ilike.%${search}%,lead_code.ilike.%${search}%`);
      q = q.order("archived_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Lead[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const stageName = (id: string | null) => stages?.find((s) => s.id === id)?.name ?? "-";
  const countryName = (id: string | null) => countries?.find((c) => c.id === id)?.name ?? "-";

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((s) => {
      const allIn = rows.every((r) => s.has(r.id));
      const next = new Set(s);
      rows.forEach((r) => (allIn ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  };

  const restore = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.from("leads").update({ archived: false, archived_at: null } as never).in("id", ids);
    qc.invalidateQueries({ queryKey: ["archived-leads"] });
    setSelected(new Set());
  };

  const runDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirm.trim() !== deleteTarget.company_name) return;
    await supabase.from("leads").delete().eq("id", deleteTarget.id);
    qc.invalidateQueries({ queryKey: ["archived-leads"] });
    setDeleteTarget(null);
    setDeleteConfirm("");
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    // live: guide="archive" (repo AppPage has no guide prop)
    <AppPage module="lead" title="Archive" perm="lead.archive">
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search company or lead code..."
              className="h-8 w-[280px] text-[13px]"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            {selected.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => restore(Array.from(selected))}>
                Restore {selected.size} selected
              </Button>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          {isLoading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState title="No archived leads" hint="Leads you archive will show up here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="h-9 w-9 px-3">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground">Company</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground">Lead code</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground">Stage</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground">Country</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground">Date added</th>
                    <th className="h-9 px-3 text-left font-medium text-muted-foreground">Archived</th>
                    <th className="h-9 px-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="h-9 border-b border-border last:border-0 hover:bg-subtle">
                      <td className="px-3">
                        <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                      </td>
                      <td className="px-3 font-medium">{l.company_name}</td>
                      <td className="px-3 text-muted-foreground">{l.lead_code}</td>
                      <td className="px-3">{stageName(l.stage_id)}</td>
                      <td className="px-3">{countryName(l.country_id)}</td>
                      <td className="px-3">{fmtDate(l.date_added)}</td>
                      <td className="px-3">{fmtDate(l.archived_at)}</td>
                      <td className="px-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => restore([l.id])}>
                            Restore
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-negative"
                              onClick={() => {
                                setDeleteTarget(l);
                                setDeleteConfirm("");
                              }}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {count > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="label-text">
                Page {page + 1} of {totalPages} ({count} total)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete lead permanently</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="label-text">
              This cannot be undone. Type <span className="font-medium text-foreground">{deleteTarget?.company_name}</span> to confirm.
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Company name"
              className="h-8 text-[13px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || deleteConfirm.trim() !== deleteTarget.company_name}
              onClick={runDelete}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
