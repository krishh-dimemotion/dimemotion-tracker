// Ported from live chunk lt.leads.instagram-*.js
import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/components/app-shell";
import { LeadQuickAdd, TodayLeadStream } from "@/components/lt/today-lead-stream";
import { ChannelOutreachRates, useRateRange } from "@/components/lt/outreach-rates";

export const Route = createFileRoute("/lt/leads/instagram")({
  head: () => ({ meta: [{ title: "Instagram Leads | Lead Tracker" }] }),
  component: InstagramLeadsPage,
});

function InstagramLeadsPage() {
  const range = useRateRange("week");
  return (
    // live: guide="rapid-entry" (repo AppPage has no guide prop)
    <AppPage module="lead" title="Instagram Leads" perm="lead.leads">
      <div className="flex flex-col gap-4">
        <LeadQuickAdd kind="instagram" />
        <ChannelOutreachRates kind="instagram" label="Instagram" range={range} />
        <TodayLeadStream kind="instagram" range={range} />
      </div>
    </AppPage>
  );
}
