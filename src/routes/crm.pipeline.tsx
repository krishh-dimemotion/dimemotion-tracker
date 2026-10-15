// Ported from live chunk crm.pipeline-BrAdr9E4.js.
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppPage } from "@/components/app-shell";
import { Dot, EmptyState, Loading, Pill } from "@/components/live/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useStages } from "@/hooks/useLookups";
import { useReportCurrency } from "@/components/crm/report-currency";
import { dealTotal } from "@/components/crm/earnings";
import { PRIORITY_COLORS, dealValueLabel } from "@/components/crm/helpers";

export const Route = createFileRoute("/crm/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline | CRM | Tracker" },
      { name: "description", content: "Kanban view of CRM deals by stage." },
      { property: "og:title", content: "Pipeline | CRM | Tracker" },
      { property: "og:description", content: "Kanban view of CRM deals by stage." },
    ],
  }),
  component: PipelinePage,
});

type PipelineRecord = {
  id: string;
  stage_id: string | null;
  priority: string;
  estimated_value: number | null;
  currency: string | null;
  deal_type: string | null;
  mrr_amount: number | null;
  contract_months: number | null;
  notes: string | null;
  updated_at: string;
  closed_at: string | null;
  leads: { company_name: string } | null;
};

const COLLAPSED_KEY = "tracker.pipeline.collapsed";

function PipelinePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: stages } = useStages("crm");
  const query = useQuery({
    queryKey: ["crm_pipeline_records"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crm_records")
        .select("*, leads(company_name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PipelineRecord[];
    },
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  const [wonDialog, setWonDialog] = useState<{ recordId: string; stageId: string; value: string } | null>(null);
  const [lostDialog, setLostDialog] = useState<{ recordId: string; stageId: string; reason: string } | null>(null);

  const move = useMutation({
    mutationFn: async ({ recordId, patch }: { recordId: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("crm_records").update(patch).eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipeline_records"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to move"),
  });

  const records = query.data ?? [];
  const fx = useReportCurrency();

  const dropOn = (stageId: string) => {
    if (!dragId) return;
    const rec = records.find((r) => r.id === dragId);
    setDragId(null);
    if (!rec) return;
    const stage = (stages ?? []).find((s) => s.id === stageId);
    if (!stage || rec.stage_id === stageId) return;
    if (stage.is_won) {
      setWonDialog({ recordId: rec.id, stageId, value: String(rec.estimated_value ?? "") });
      return;
    }
    if (stage.is_lost) {
      setLostDialog({ recordId: rec.id, stageId, reason: "" });
      return;
    }
    move.mutate({ recordId: rec.id, patch: { stage_id: stageId, probability: stage.default_probability } });
  };

  if (query.isLoading)
    return (
      <AppPage guide="pipeline" module="crm" title="Pipeline" perm="crm.pipeline">
        <Loading />
      </AppPage>
    );

  return (
    <AppPage guide="pipeline" module="crm" title="Pipeline" perm="crm.pipeline">
      {records.length === 0 ? (
        <EmptyState title="No deals in the pipeline" hint="Records appear here once a lead is marked replied." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]">
          {(stages ?? [])
            .filter((s) => !hidden.has(s.id))
            .map((stage) => {
              const inStage = records.filter((r) => r.stage_id === stage.id);
              const total = inStage.reduce((a, r) => a + dealTotal(r as any, fx), 0);
              return (
                <div
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(stage.id);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
                  }}
                  onDrop={() => {
                    setOverStage(null);
                    dropOn(stage.id);
                  }}
                  className={cn(
                    "group flex w-[280px] min-w-[280px] shrink-0 flex-col rounded-xl border p-3 transition-colors",
                    overStage === stage.id ? "border-ring bg-subtle" : "border-border/60 bg-subtle/40",
                  )}
                >
                  <div className="px-0.5 pb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Pill color={stage.color}>{stage.name}</Pill>
                      <span className="flex items-center gap-1.5">
                        <span className="rounded-full border border-border bg-surface px-1.5 font-mono text-[10.5px] font-semibold text-muted-foreground">
                          {inStage.length}
                        </span>
                        <button
                          type="button"
                          title={`Hide ${stage.name}`}
                          aria-label={`Hide ${stage.name}`}
                          onClick={() => toggleHidden(stage.id)}
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-subtle hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <EyeOff className="size-3.5" />
                        </button>
                      </span>
                    </div>
                    <div className="tabular mt-1.5 text-[12.5px] font-semibold text-muted-foreground">
                      {fx.fmt(total)}
                    </div>
                  </div>
                  <div className="flex min-h-[80px] flex-col gap-2">
                    {inStage.map((r) => (
                      <div
                        key={r.id}
                        draggable
                        onDragStart={() => setDragId(r.id)}
                        onDragEnd={() => setOverStage(null)}
                        onClick={() => navigate({ to: "/crm/records/$id", params: { id: r.id } })}
                        className="pro-card pressable cursor-grab space-y-2 p-3.5 text-left hover:border-foreground/20 active:cursor-grabbing"
                      >
                        <div className="text-[13px] font-semibold tracking-tight text-foreground">
                          {r.leads?.company_name}
                        </div>
                        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                          <span className="flex items-center gap-1.5 capitalize">
                            <Dot color={PRIORITY_COLORS[r.priority]} /> {r.priority}
                          </span>
                          <span className="tabular text-[13px] font-semibold text-foreground">{dealValueLabel(r)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          {(stages ?? []).some((s) => hidden.has(s.id)) && (
            <div className="w-[200px] shrink-0 self-start rounded-lg border border-dashed border-border p-2">
              <div className="px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">Hidden stages</div>
              <div className="flex flex-col gap-1">
                {(stages ?? [])
                  .filter((s) => hidden.has(s.id))
                  .map((s) => {
                    const count = records.filter((r) => r.stage_id === s.id).length;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        title={`Show ${s.name}`}
                        onClick={() => toggleHidden(s.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => dropOn(s.id)}
                        className="group/row flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-subtle"
                      >
                        <Pill color={s.color}>{s.name}</Pill>
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {count}
                          <Eye className="size-3.5 opacity-0 transition-opacity group-hover/row:opacity-100" />
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!wonDialog} onOpenChange={(o) => !o && setWonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm won deal</DialogTitle>
          </DialogHeader>
          <div>
            <div className="label-text mb-1">Final value</div>
            <Input
              type="number"
              className="h-8 text-[13px]"
              value={wonDialog?.value ?? ""}
              onChange={(e) => setWonDialog((d) => d && { ...d, value: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!wonDialog) return;
                const stage = (stages ?? []).find((s) => s.id === wonDialog.stageId);
                move.mutate({
                  recordId: wonDialog.recordId,
                  patch: {
                    stage_id: wonDialog.stageId,
                    probability: stage?.default_probability ?? 100,
                    closed_at: new Date().toISOString(),
                    estimated_value: wonDialog.value ? Number(wonDialog.value) : null,
                  },
                });
                setWonDialog(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lostDialog} onOpenChange={(o) => !o && setLostDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reason for loss</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="One line reason"
            className="h-8 text-[13px]"
            value={lostDialog?.reason ?? ""}
            onChange={(e) => setLostDialog((d) => d && { ...d, reason: e.target.value })}
          />
          <DialogFooter>
            <Button
              onClick={() => {
                if (!lostDialog) return;
                const stage = (stages ?? []).find((s) => s.id === lostDialog.stageId);
                const notes = [
                  records.find((r) => r.id === lostDialog.recordId)?.notes,
                  lostDialog.reason ? `Lost: ${lostDialog.reason}` : null,
                ]
                  .filter(Boolean)
                  .join("\n");
                move.mutate({
                  recordId: lostDialog.recordId,
                  patch: { stage_id: lostDialog.stageId, probability: stage?.default_probability ?? 0, notes },
                });
                setLostDialog(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
