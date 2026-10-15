// Ported from live chunk TodosView-CEdgBG2A.js. Shared by /crm/todos and /lt/todos.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useProfiles } from "@/hooks/useLookups";
import { AppPage, type ModuleKey } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, DatePicker, Loading } from "@/components/live/kit";
import {
  LeadPicker,
  TASK_SELECT,
  TaskRow,
  useTaskMutations,
  type LeadPick,
  type LeadTask,
} from "@/components/crm/activity-shared";

type ProfileLite = { id: string; full_name: string | null; email: string | null };

function AddTaskDialog({ profiles }: { profiles: ProfileLite[] }) {
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<LeadPick | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const { add } = useTaskMutations(() => {
    setOpen(false);
    setTitle("");
    setDue("");
    setAssignee("");
    setLead(null);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="ml-auto h-8 text-[12px] gap-1.5">
          <Plus className="size-3.5" /> Add task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add a new task</DialogTitle>
          <DialogDescription>
            Attach a to-do to a specific client or lead with an optional due date and owner.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!lead) return;
            const t = title.trim();
            // Live sends the raw select value; "unassigned" is mapped to null here so the insert is valid.
            if (t)
              add.mutate({
                lead_id: lead.id,
                title: t,
                due_date: due || null,
                assignee_id: assignee && assignee !== "unassigned" ? assignee : null,
              });
          }}
          className="flex flex-col gap-3 py-2"
        >
          <div>
            <div className="label-text mb-1">Lead / Client *</div>
            <LeadPicker value={lead} onChange={setLead} placeholder="Search lead or client…" />
          </div>
          <div>
            <div className="label-text mb-1">Task title *</div>
            <Input
              placeholder="e.g. Follow up on proposal, send revised quote"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-[13px]"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="label-text mb-1">Due date</div>
              <DatePicker
                value={due || undefined}
                onChange={(v: string | null | undefined) => setDue(v || "")}
                placeholder="Pick due date"
                className="w-full text-[12px]"
              />
            </div>
            <div>
              <div className="label-text mb-1">Owner</div>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!lead || !title.trim() || add.isPending}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskGroup({
  title,
  tasks,
  canEdit,
  defaultOpen = true,
  tone,
}: {
  title: string;
  tasks: LeadTask[];
  canEdit: boolean;
  defaultOpen?: boolean;
  tone?: "danger";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className={cn("text-[13px] font-medium", tone === "danger" && tasks.length > 0 && "text-destructive")}>
          {title}
        </span>
        <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
          {tasks.length}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          {tasks.length === 0 ? (
            <div className="px-1 py-2 text-[12px] text-muted-foreground">Nothing here.</div>
          ) : (
            tasks.map((t) => <TaskRow key={t.id} task={t} canEdit={canEdit} showLead />)
          )}
        </div>
      )}
    </Card>
  );
}

export function TodosView({ module, perm }: { module: ModuleKey; perm: string }) {
  const { can } = useAuth();
  const canEdit = can("crm.record_edit") || can("lead.lead_edit");
  const { data: profiles } = useProfiles();
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["lead_tasks", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lead_tasks")
        .select(TASK_SELECT)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as LeadTask[];
    },
  });

  const groups = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const visible = (data ?? []).filter((t) => {
      if (owner !== "all" && t.assignee_id !== owner) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!`${t.title} ${t.leads?.company_name ?? ""}`.toLowerCase().includes(s)) return false;
      }
      return true;
    });
    const open = visible.filter((t) => !t.completed_at);
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today),
      today: open.filter((t) => t.due_date === today),
      upcoming: open.filter((t) => t.due_date && t.due_date > today),
      undated: open.filter((t) => !t.due_date),
      done: visible.filter((t) => t.completed_at).slice(0, 100),
    };
  }, [data, owner, search]);

  return (
    <AppPage module={module} title="To-dos" perm={perm} guide={module === "crm" ? "crm-followups" : "todos"}>
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search tasks or companies"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[220px] text-[12px]"
            />
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-8 w-[170px] text-[12px]">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit && <AddTaskDialog profiles={profiles ?? []} />}
          </div>
        </Card>
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <TaskGroup title="Overdue" tasks={groups.overdue} canEdit={canEdit} tone="danger" />
            <TaskGroup title="Due today" tasks={groups.today} canEdit={canEdit} />
            <TaskGroup title="Upcoming" tasks={groups.upcoming} canEdit={canEdit} />
            <TaskGroup title="No due date" tasks={groups.undated} canEdit={canEdit} defaultOpen={false} />
            <TaskGroup title="Completed" tasks={groups.done} canEdit={canEdit} defaultOpen={false} />
          </>
        )}
      </div>
    </AppPage>
  );
}
