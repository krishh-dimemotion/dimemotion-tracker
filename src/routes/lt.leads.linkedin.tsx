// Ported from live chunk lt.leads.linkedin-*.js
import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/components/app-shell";
import { LeadQuickAdd, TodayLeadStream } from "@/components/lt/today-lead-stream";
import { ChannelOutreachRates, useRateRange } from "@/components/lt/outreach-rates";

export const Route = createFileRoute("/lt/leads/linkedin")({
  head: () => ({ meta: [{ title: "LinkedIn Leads | Lead Tracker" }] }),
  component: LinkedInLeadsPage,
});

function LinkedInLeadsPage() {
  const range = useRateRange("week");
  return (
    // live: guide="rapid-entry" (repo AppPage has no guide prop)
    <AppPage module="lead" title="LinkedIn Leads" perm="lead.leads">
      <div className="flex flex-col gap-4">
        <LeadQuickAdd kind="linkedin" />
        <ChannelOutreachRates kind="linkedin" label="LinkedIn" range={range} />
        <TodayLeadStream kind="linkedin" range={range} />
      </div>
    </AppPage>
  );
}
