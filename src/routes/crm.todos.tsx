import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { Card, Loading } from "@/components/kit";
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
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { TASK_SELECT, TaskRow, type LeadTask } from "@/components/tasks/tasks";

export const Route = createFileRoute("/crm/todos")({
  head: () => ({
    meta: [
      { title: "To-dos — CRM — Buzzspear Tracker" },
      { name: "description", content: "Every open task across your leads and deals, grouped by due date." },
      { property: "og:title", content: "To-dos — CRM — Buzzspear Tracker" },
      { property: "og:description", content: "Every open task across your leads and deals, grouped by due date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodosPage,
});

function Section({
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

function TodosPage() {
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
    const all = (data ?? []).filter((t) => {
      if (owner !== "all" && t.assignee_id !== owner) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${t.title} ${t.leads?.company_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const open = all.filter((t) => !t.completed_at);
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today),
      today: open.filter((t) => t.due_date === today),
      upcoming: open.filter((t) => t.due_date && t.due_date > today),
      undated: open.filter((t) => !t.due_date),
      done: all.filter((t) => t.completed_at).slice(0, 100),
    };
  }, [data, owner, search]);

  return (
    <AppPage module="crm" title="To-dos" perm="crm.todos">
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
                {(profiles ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {isLoading ? (
          <Loading />
        ) : (
          <>
            <Section title="Overdue" tasks={groups.overdue} canEdit={canEdit} tone="danger" />
            <Section title="Due today" tasks={groups.today} canEdit={canEdit} />
            <Section title="Upcoming" tasks={groups.upcoming} canEdit={canEdit} />
            <Section title="No due date" tasks={groups.undated} canEdit={canEdit} defaultOpen={false} />
            <Section title="Completed" tasks={groups.done} canEdit={canEdit} defaultOpen={false} />
          </>
        )}
      </div>
    </AppPage>
  );
}
