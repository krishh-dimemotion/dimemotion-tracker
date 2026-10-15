// Ported from live chunk lt.leads.email-*.js
import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/components/app-shell";
import { LeadQuickAdd, TodayLeadStream } from "@/components/lt/today-lead-stream";
import { ChannelOutreachRates, useRateRange } from "@/components/lt/outreach-rates";

export const Route = createFileRoute("/lt/leads/email")({
  head: () => ({ meta: [{ title: "Email Leads | Lead Tracker" }] }),
  component: EmailLeadsPage,
});

function EmailLeadsPage() {
  const range = useRateRange("week");
  return (
    // live: guide="rapid-entry" (repo AppPage has no guide prop)
    <AppPage module="lead" title="Email Leads" perm="lead.leads">
      <div className="flex flex-col gap-4">
        <LeadQuickAdd kind="email" />
        <ChannelOutreachRates kind="email" label="Email" range={range} />
        <TodayLeadStream kind="email" range={range} />
      </div>
    </AppPage>
  );
}
