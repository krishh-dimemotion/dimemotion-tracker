// Ported from live chunk TodosView-CEdgBG2A.js
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import { AppPage, type ModuleKey } from "@/components/app-shell";
import { Card, DatePicker, Loading } from "@/components/live/kit";
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
import { supabase } from "@/integrations/supabase/client";
import { useProfiles } from "@/hooks/useLookups";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { TASK_SELECT, TaskRow, useTaskActions, type LeadTask } from "@/components/lt/tasks";
import { LeadPicker, type PickedLead } from "@/components/lt/events";

type ProfileLite = { id: string; full_name: string | null; email: string | null };

function AddTaskDialog({ profiles }: { profiles: ProfileLite[] }) {
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<PickedLead | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");
  const { add } = useTaskActions(() => {
    setOpen(false);
    setTitle("");
    setDue("");
    setOwner("");
    setLead(null);
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    const t = title.trim();
    if (!t) return;
    // NOTE: live sends assignee_id "unassigned" literally when that option is picked.
    add.mutate({ lead_id: lead.id, title: t, due_date: due || null, assignee_id: owner || null } as never);
  };

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
        <form onSubmit={submit} className="flex flex-col gap-3 py-2">
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
                onChange={(v?: string) => setDue(v || "")}
                placeholder="Pick due date"
                className="w-full text-[12px]"
              />
            </div>
            <div>
              <div className="label-text mb-1">Owner</div>
              <Select value={owner} onValueChange={setOwner}>
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
        onClick={() => setOpen((o) => !o)}
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

export function TodosView({ module, perm }: { module: ModuleKey; perm?: string }) {
  const { can } = useAuth();
  const canEdit = can("crm.record_edit") || can("lead.lead_edit");
  const { data: profiles } = useProfiles();
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lead_tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select(TASK_SELECT)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as LeadTask[];
    },
  });

  const groups = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = (data ?? []).filter((t) => {
      if (owner !== "all" && t.assignee_id !== owner) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${t.title} ${t.leads?.company_name ?? ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const open = rows.filter((t) => !t.completed_at);
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today),
      today: open.filter((t) => t.due_date === today),
      upcoming: open.filter((t) => t.due_date && t.due_date > today),
      undated: open.filter((t) => !t.due_date),
      done: rows.filter((t) => t.completed_at).slice(0, 100),
    };
  }, [data, owner, search]);

  const profileList = (profiles ?? []) as ProfileLite[];

  return (
    // live: guide={module === "crm" ? "crm-followups" : "todos"} (repo AppPage has no guide prop)
    <AppPage module={module} title="To-dos" perm={perm}>
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
                {profileList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit && <AddTaskDialog profiles={profileList} />}
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
