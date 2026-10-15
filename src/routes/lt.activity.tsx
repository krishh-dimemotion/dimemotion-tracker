import { createFileRoute } from "@tanstack/react-router";
import { ActivityView } from "@/components/lt/activity-view";

export const Route = createFileRoute("/lt/activity")({
  head: () => ({ meta: [{ title: "Activity | Lead Tracker" }] }),
  component: () => <ActivityView module="lead" perm="lead.leads" />,
});
