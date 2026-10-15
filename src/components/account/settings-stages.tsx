import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStages, type Stage } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Loading } from "@/components/live/kit";

function StageBoard({ board }: { board: "lead" | "crm" }) {
  const { data: stages, isLoading } = useStages(board);
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);
  const [replacementId, setReplacementId] = useState<string>("");
  const [leadCount, setLeadCount] = useState<number>(0);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["stages"] });

  const addStage = async () => {
    const maxIndex = (stages ?? []).reduce((m, s) => Math.max(m, s.order_index), -1);
    const { error } = await supabase.from("stages").insert({
      name: "New stage",
      board,
      order_index: maxIndex + 1,
      color: "#888888",
    });
    if (error) return window.alert(error.message);
    invalidate();
  };

  const updateStage = async (id: string, patch: Partial<Stage>) => {
    const { error } = await supabase.from("stages").update(patch).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const requestDelete = async (stage: Stage) => {
    const { count, error } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stage.id);
    if (error) return window.alert(error.message);
    if (count && count > 0) {
      setLeadCount(count);
      setDeleteTarget(stage);
      setReplacementId("");
    } else {
      if (!window.confirm(`Delete stage "${stage.name}"?`)) return;
      await performDelete(stage.id);
    }
  };

  const performDelete = async (id: string) => {
    const { error } = await supabase.from("stages").delete().eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const confirmReplace = async () => {
    if (!deleteTarget || !replacementId) return;
    const { error: err1 } = await supabase
      .from("leads")
      .update({ stage_id: replacementId })
      .eq("stage_id", deleteTarget.id);
    if (err1) return window.alert(err1.message);
    await performDelete(deleteTarget.id);
    setDeleteTarget(null);
  };

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId || !stages) return setDragId(null);
    const ordered = [...stages];
    const from = ordered.findIndex((s) => s.id === dragId);
    const to = ordered.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return setDragId(null);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setDragId(null);
    await Promise.all(
      ordered.map((s, idx) =>
        s.order_index === idx ? null : supabase.from("stages").update({ order_index: idx }).eq("id", s.id),
      ),
    );
    invalidate();
  };

  if (isLoading) return <Loading label="Loading stages" />;

  const other = (stages ?? []).filter((s) => s.id !== deleteTarget?.id);

  return (
    <div className="flex flex-col gap-2">
      {(stages ?? []).length === 0 && <EmptyState title="No stages yet" hint="Add a stage to get started." />}
      {(stages ?? []).map((s) => (
        <div
          key={s.id}
          draggable
          onDragStart={() => setDragId(s.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(s.id)}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-subtle px-2 py-2"
        >
          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
          <input
            type="color"
            value={s.color}
            onChange={(e) => updateStage(s.id, { color: e.target.value })}
            className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
          />
          <Input
            defaultValue={s.name}
            className="h-8 w-40 text-[13px]"
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== s.name) updateStage(s.id, { name: e.target.value.trim() });
            }}
          />
          <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Checkbox checked={s.is_reply_stage} onCheckedChange={(v) => updateStage(s.id, { is_reply_stage: v === true })} />
            Reply
          </label>
          <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Checkbox checked={s.is_won} onCheckedChange={(v) => updateStage(s.id, { is_won: v === true })} />
            Won
          </label>
          <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Checkbox checked={s.is_lost} onCheckedChange={(v) => updateStage(s.id, { is_lost: v === true })} />
            Lost
          </label>
          <Button variant="ghost" size="icon" className="ml-auto size-8 shrink-0" onClick={() => requestDelete(s)}>
            <Trash2 className="size-4 text-negative" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="mt-1 w-fit" onClick={addStage}>
        <Plus className="size-4" /> Add stage
      </Button>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign leads before deleting</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            {leadCount} lead(s) use stage "{deleteTarget?.name}". Pick a replacement stage to move them to before deleting.
          </p>
          <Select value={replacementId} onValueChange={setReplacementId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose replacement stage" />
            </SelectTrigger>
            <SelectContent>
              {other.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!replacementId} onClick={confirmReplace}>
              Reassign and delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StagesSettings() {
  const [tab, setTab] = useState<"lead" | "crm">("lead");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "lead" | "crm")}>
      <TabsList>
        <TabsTrigger value="lead">Lead stages</TabsTrigger>
        <TabsTrigger value="crm">CRM stages</TabsTrigger>
      </TabsList>
      <TabsContent value="lead">
        <StageBoard board="lead" />
      </TabsContent>
      <TabsContent value="crm">
        <StageBoard board="crm" />
      </TabsContent>
    </Tabs>
  );
}
