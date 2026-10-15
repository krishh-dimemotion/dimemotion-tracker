import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { CollapsibleCard } from "@/components/kit";
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
import { useProfiles } from "@/hooks/useLookups";
import { useAuth } from "@/lib/live/auth";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LeadTask = {
  id: string;
  lead_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  assignee_id: string | null;
  completed_at: string | null;
  created_at: string;
  leads?: { id: string; company_name: string; lead_code: string } | null;
};

export const TASK_SELECT = "*, leads(id,company_name,lead_code)";

export function useTaskActions(onDone?: () => void) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["lead_tasks"] });
    onDone?.();
  };

  const add = useMutation({
    mutationFn: async (task: {
      lead_id: string;
      title: string;
      due_date?: string | null;
      assignee_id?: string | null;
    }) => {
      const { error } = await supabase.from("lead_tasks").insert(task as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Could not add the task"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("lead_tasks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Could not save the task"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Could not delete the task"),
  });

  return { add, update, remove };
}

export function TaskRow({
  task,
  canEdit,
  showLead = false,
}: {
  task: LeadTask;
  canEdit: boolean;
  showLead?: boolean;
}) {
  const { update, remove } = useTaskActions();
  const { data: profiles } = useProfiles();
  const assignee = (profiles ?? []).find((p: any) => p.id === task.assignee_id) as any;
  const done = !!task.completed_at;
  const overdue = !done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
      <input
        type="checkbox"
        checked={done}
        disabled={!canEdit}
        onChange={(e) =>
          update.mutate({ id: task.id, patch: { completed_at: e.target.checked ? new Date().toISOString() : null } })
        }
      />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13px]", done && "text-muted-foreground line-through")}>{task.title}</div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {showLead && task.leads ? <span>{task.leads.company_name}</span> : null}
          {task.due_date ? (
            <span className={cn(overdue && "text-destructive")}>Due {fmtDate(task.due_date)}</span>
          ) : null}
          {assignee ? <span>{assignee.full_name || assignee.email}</span> : null}
        </div>
      </div>
      {canEdit && (
        <Button variant="ghost" size="icon" className="size-7" onClick={() => remove.mutate(task.id)}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

export function TaskComposer({
  leadId,
  canEdit,
  onAdded,
}: {
  leadId: string;
  canEdit: boolean;
  onAdded?: () => void;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { add } = useTaskActions(onAdded);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState<string>(user?.id ?? "");

  const submit = () => {
    if (!title.trim()) return;
    add.mutate(
      { lead_id: leadId, title: title.trim(), due_date: due || null, assignee_id: assignee || null },
      {
        onSuccess: () => {
          setTitle("");
          setDue("");
        },
      },
    );
  };

  if (!canEdit) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Add a to-do"
        className="h-8 min-w-[180px] flex-1 text-[13px]"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <Input type="date" className="h-8 w-[150px] text-[13px]" value={due} onChange={(e) => setDue(e.target.value)} />
      <Select value={assignee || undefined} onValueChange={setAssignee}>
        <SelectTrigger className="h-8 w-[160px] text-[12px]">
          <SelectValue placeholder="Owner" />
        </SelectTrigger>
        <SelectContent>
          {(profiles ?? []).map((p: any) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name || p.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={submit} disabled={add.isPending}>
        <Plus className="mr-1 size-3.5" /> Add
      </Button>
    </div>
  );
}

/** To-dos for a single lead, used on the lead page and inside a CRM record. */
export function LeadTasksCard({
  leadId,
  canEdit,
  cardId = "lead.todos",
}: {
  leadId: string;
  canEdit: boolean;
  cardId?: string;
}) {
  const [showDone, setShowDone] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["lead_tasks", "lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select(TASK_SELECT)
        .eq("lead_id", leadId)
        .order("completed_at", { ascending: true, nullsFirst: true })
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as LeadTask[];
    },
  });

  const tasks = data ?? [];
  const open = tasks.filter((t) => !t.completed_at);
  const done = tasks.filter((t) => t.completed_at);

  return (
    <CollapsibleCard
      id={cardId}
      title="To-dos"
      actions={<span className="text-[12px] text-muted-foreground">{open.length} open</span>}
    >
      <div className="flex flex-col gap-3">
        <TaskComposer leadId={leadId} canEdit={canEdit} />
        {isLoading ? (
          <div className="text-[12px] text-muted-foreground">Loading</div>
        ) : open.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">Nothing to do here yet.</div>
        ) : (
          open.map((t) => <TaskRow key={t.id} task={t} canEdit={canEdit} />)
        )}
        {done.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="w-fit text-[12px] text-muted-foreground hover:text-foreground"
            >
              {showDone ? "Hide" : "Show"} completed ({done.length})
            </button>
            {showDone && done.map((t) => <TaskRow key={t.id} task={t} canEdit={canEdit} />)}
          </>
        )}
      </div>
    </CollapsibleCard>
  );
}
