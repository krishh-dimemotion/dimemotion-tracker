// Ported from live chunk crm.todos-GTkfHEui.js.
import { createFileRoute } from "@tanstack/react-router";
import { TodosView } from "@/components/crm/TodosView";

export const Route = createFileRoute("/crm/todos")({
  head: () => ({
    meta: [
      { title: "To-dos | CRM | Tracker" },
      { name: "description", content: "Every open task across your leads and deals, grouped by due date." },
      { property: "og:title", content: "To-dos | CRM | Tracker" },
      { property: "og:description", content: "Every open task across your leads and deals, grouped by due date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <TodosView module="crm" perm="crm.todos" />,
});
