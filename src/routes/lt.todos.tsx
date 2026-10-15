import { createFileRoute } from "@tanstack/react-router";
import { TodosView } from "@/components/lt/todos-view";

export const Route = createFileRoute("/lt/todos")({
  head: () => ({ meta: [{ title: "To-dos | Lead Tracker" }] }),
  component: () => <TodosView module="lead" perm="lead.leads" />,
});
