import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppPage } from "@/components/app-shell";
import { CollapsibleCard } from "@/components/kit";
import { StagesCard } from "@/components/settings/StagesCard";
import { AccountsCard } from "@/components/settings/AccountsCard";
import { CountriesCard } from "@/components/settings/CountriesCard";
import { TagsCard } from "@/components/settings/TagsCard";
import { TargetsCard } from "@/components/settings/TargetsCard";
import { ShortcutsCard } from "@/components/settings/ShortcutsCard";
import { AccountCard } from "@/components/settings/AccountCard";
import { UsersCard } from "@/components/settings/UsersCard";
import { PresetsCard } from "@/components/settings/PresetsCard";
import { DataCard } from "@/components/settings/DataCard";
import { FollowupTemplatesCard } from "@/components/settings/FollowupTemplatesCard";
import { ImportMappingsCard } from "@/components/settings/ImportMappingsCard";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Buzzspear Tracker" },
      { name: "description", content: "Manage stages, channels, tags, targets, shortcuts, account and access." },
      { property: "og:title", content: "Settings — Buzzspear Tracker" },
      {
        property: "og:description",
        content: "Manage stages, channels, tags, targets, shortcuts, account and access.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { can, profile, isAdmin } = useAuth();
  const module = profile?.default_module === "crm" ? "crm" : "lead";

  return (
    <AppPage module={module} title="Settings" perm="settings.view">
      <div className="flex flex-col gap-3">
        <CollapsibleCard id="settings.account" title="Account" defaultOpen>
          <AccountCard />
        </CollapsibleCard>

        {can("settings.stages") && (
          <CollapsibleCard id="settings.stages" title="Stages" defaultOpen={false}>
            <StagesCard />
          </CollapsibleCard>
        )}

        {can("settings.accounts") && (
          <CollapsibleCard id="settings.accounts" title="Channels and sender accounts" defaultOpen={false}>
            <AccountsCard />
          </CollapsibleCard>
        )}

        {can("settings.countries") && (
          <CollapsibleCard id="settings.countries" title="Countries" defaultOpen={false}>
            <CountriesCard />
          </CollapsibleCard>
        )}

        {can("settings.tags") && (
          <CollapsibleCard id="settings.tags" title="Tags" defaultOpen={false}>
            <TagsCard />
          </CollapsibleCard>
        )}

        {can("settings.targets") && (
          <CollapsibleCard id="settings.targets" title="Outreach targets" defaultOpen={false}>
            <TargetsCard />
          </CollapsibleCard>
        )}

        {can("lead.leads") && (
          <CollapsibleCard id="settings.followup_templates" title="Follow-up templates" defaultOpen={false}>
            <FollowupTemplatesCard />
          </CollapsibleCard>
        )}

        {can("settings.shortcuts") && (
          <CollapsibleCard id="settings.shortcuts" title="Keyboard shortcuts" defaultOpen={false}>
            <ShortcutsCard />
          </CollapsibleCard>
        )}

        {isAdmin && (
          <CollapsibleCard id="settings.users" title="Users and access" defaultOpen={false}>
            <UsersCard />
          </CollapsibleCard>
        )}

        {isAdmin && (
          <CollapsibleCard id="settings.presets" title="Access presets" defaultOpen={false}>
            <PresetsCard />
          </CollapsibleCard>
        )}

        {(can("lead.import_export") || isAdmin) && (
          <CollapsibleCard id="settings.data" title="Data" defaultOpen={false}>
            <DataCard />
          </CollapsibleCard>
        )}

        {(can("lead.import_export") || isAdmin) && (
          <CollapsibleCard id="settings.import_mappings" title="Saved import mappings" defaultOpen={false}>
            <ImportMappingsCard />
          </CollapsibleCard>
        )}

        {(can("lead.import_export") || isAdmin) && (
          <CollapsibleCard id="settings.google_sheet" title="Google Sheet backup" defaultOpen={false}>
            <GoogleSheetCard />
          </CollapsibleCard>
        )}

      </div>
    </AppPage>
  );
}
