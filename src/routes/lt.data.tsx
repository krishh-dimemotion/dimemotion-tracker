import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Card, downloadCsv } from "@/components/live/kit";
import { SheetSync } from "@/components/live/sheet-sync";
import { ImportWizard } from "@/components/lt/data-import-wizard";

export const Route = createFileRoute("/lt/data")({
  head: () => ({
    meta: [
      { title: "Import / Export | Lead Tracker" },
      { name: "description", content: "Import leads from CSV or export leads and CRM records." },
      { property: "og:title", content: "Import / Export | Lead Tracker" },
      { property: "og:description", content: "Import leads from CSV or export leads and CRM records." },
    ],
  }),
  component: DataPage,
});

const LEAD_EXPORT_COLUMNS = [
  "company_name",
  "primary_contact",
  "country_id",
  "stage_id",
  "channel_id",
  "sender_account_id",
  "date_added",
  "website_url",
  "company_linkedin_url",
  "instagram_url",
  "youtube_url",
  "research_notes",
  "additional_notes",
  "next_followup_date",
  "archived",
] as const;

const CRM_EXPORT_COLUMNS = [
  "lead_id",
  "stage_id",
  "priority",
  "estimated_value",
  "currency",
  "deal_type",
  "mrr_amount",
  "contract_months",
  "probability",
  "expected_close_date",
  "closed_at",
  "owner_id",
  "notes",
  "updated_at",
] as const;

function GoogleSheetsCard() {
  return (
    <Card title="Google Sheets">
      <SheetSync />
    </Card>
  );
}

function DataPage() {
  const exportLeads = async () => {
    const { data, error } = await supabase.from("leads").select(LEAD_EXPORT_COLUMNS.join(","));
    if (error) return window.alert(`Export failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    downloadCsv("leads.csv", [[...LEAD_EXPORT_COLUMNS], ...rows.map((r) => LEAD_EXPORT_COLUMNS.map((c) => r[c] as string | number | null))]);
  };

  const exportCrm = async () => {
    const { data, error } = await supabase.from("crm_records").select(CRM_EXPORT_COLUMNS.join(","));
    if (error) return window.alert(`Export failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    downloadCsv("crm_records.csv", [[...CRM_EXPORT_COLUMNS], ...rows.map((r) => CRM_EXPORT_COLUMNS.map((c) => r[c] as string | number | null))]);
  };

  // Live passes guide="import" to the page shell; the repo AppPage has no guide prop yet.
  return (
    <AppPage module="lead" title="Import / Export" perm="lead.import_export">
      <div className="flex flex-col gap-4">
        <GoogleSheetsCard />
        <Card title="Export">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportLeads}>
              Export all leads (CSV)
            </Button>
            <Button size="sm" variant="outline" onClick={exportCrm}>
              Export CRM records (CSV)
            </Button>
          </div>
        </Card>
        <ImportWizard />
      </div>
    </AppPage>
  );
}
