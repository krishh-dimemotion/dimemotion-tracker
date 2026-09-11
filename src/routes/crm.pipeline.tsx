import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppPage } from "@/components/app-shell";
import { Card, Dot, EmptyState, Loading, Pill } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useStages } from "@/hooks/useLookups";
import { money } from "@/lib/format";
import { PRIORITY_COLORS } from "@/components/crm/helpers";

export const Route = createFileRoute("/crm/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline — CRM — Buzzspear Tracker" },
      { name: "description", content: "Kanban view of CRM deals by stage." },
      { property: "og:title", content: "Pipeline — CRM — Buzzspear Tracker" },
      { property: "og:description", content: "Kanban view of CRM deals by stage." },
    ],
  }),
  component: PipelinePage,
});

function PipelinePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: stages } = useStages("crm");

  const recordsQuery = useQuery({
    queryKey: ["crm_pipeline_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_records")
        .select("*, leads(company_name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [dragId, setDragId] = useState<string | null>(null);
  const [wonDialog, setWonDialog] = useState<{ recordId: string; stageId: string; value: string } | null>(null);
  const [lostDialog, setLostDialog] = useState<{ recordId: string; stageId: string; reason: string } | null>(null);

  const moveMutation = useMutation({
    mutationFn: async ({ recordId, patch }: { recordId: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("crm_records").update(patch).eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_pipeline_records"] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to move"),
  });

  const records = recordsQuery.data ?? [];

  const handleDrop = (stageId: string) => {
    if (!dragId) return;
    const record = records.find((r: any) => r.id === dragId);
    setDragId(null);
    if (!record) return;
    const stage = (stages ?? []).find((s) => s.id === stageId);
    if (!stage || record.stage_id === stageId) return;
    if (stage.is_won) {
      setWonDialog({ recordId: record.id, stageId, value: String(record.estimated_value ?? "") });
      return;
    }
    if (stage.is_lost) {
      setLostDialog({ recordId: record.id, stageId, reason: "" });
      return;
    }
    moveMutation.mutate({
      recordId: record.id,
      patch: { stage_id: stageId, probability: stage.default_probability },
    });
  };

  const confirmWon = () => {
    if (!wonDialog) return;
    const stage = (stages ?? []).find((s) => s.id === wonDialog.stageId);
    moveMutation.mutate({
      recordId: wonDialog.recordId,
      patch: {
        stage_id: wonDialog.stageId,
        probability: stage?.default_probability ?? 100,
        closed_at: new Date().toISOString(),
        estimated_value: wonDialog.value ? Number(wonDialog.value) : null,
      },
    });
    setWonDialog(null);
  };

  const confirmLost = () => {
    if (!lostDialog) return;
    const stage = (stages ?? []).find((s) => s.id === lostDialog.stageId);
    const record = records.find((r: any) => r.id === lostDialog.recordId);
    const notes = [record?.notes, lostDialog.reason ? `Lost: ${lostDialog.reason}` : null].filter(Boolean).join("\n");
    moveMutation.mutate({
      recordId: lostDialog.recordId,
      patch: { stage_id: lostDialog.stageId, probability: stage?.default_probability ?? 0, notes },
    });
    setLostDialog(null);
  };

  if (recordsQuery.isLoading) {
    return (
      <AppPage module="crm" title="Pipeline" perm="crm.pipeline">
        <Loading />
      </AppPage>
    );
  }

  return (
    <AppPage module="crm" title="Pipeline" perm="crm.pipeline">
      {records.length === 0 ? (
        <EmptyState title="No deals in the pipeline" hint="Records appear here once a lead is marked replied." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {(stages ?? []).map((s) => {
            const stageRecords = records.filter((r: any) => r.stage_id === s.id);
            const total = stageRecords.reduce((sum: number, r: any) => sum + (r.estimated_value ?? 0), 0);
            return (
              <div
                key={s.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(s.id)}
                className="w-[280px] shrink-0 rounded-lg border border-border bg-card"
              >
                <div className="border-b border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <Pill color={s.color}>{s.name}</Pill>
                    <span className="text-[11px] text-muted-foreground">{stageRecords.length}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-muted-foreground">{money(total)}</div>
                </div>
                <div className="flex min-h-[80px] flex-col gap-2 p-2">
                  {stageRecords.map((r: any) => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={() => setDragId(r.id)}
                      onClick={() => navigate({ to: "/crm/records/$id", params: { id: r.id } })}
                      className="cursor-grab rounded-md border border-border bg-background p-2 text-left hover:bg-subtle active:cursor-grabbing"
                    >
                      <div className="text-[13px] font-medium">{r.leads?.company_name}</div>
                      <div className="mt-1 flex items-center justify-between text-[12px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Dot color={PRIORITY_COLORS[r.priority]} /> {r.priority}
                        </span>
                        <span>{money(r.estimated_value, r.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!wonDialog} onOpenChange={(v) => !v && setWonDialog(null)}>
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
              onChange={(e) => setWonDialog((d) => (d ? { ...d, value: e.target.value } : d))}
            />
          </div>
          <DialogFooter>
            <Button onClick={confirmWon}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lostDialog} onOpenChange={(v) => !v && setLostDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reason for loss</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="One line reason"
            className="h-8 text-[13px]"
            value={lostDialog?.reason ?? ""}
            onChange={(e) => setLostDialog((d) => (d ? { ...d, reason: e.target.value } : d))}
          />
          <DialogFooter>
            <Button onClick={confirmLost}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
