// Live chunk: SheetSync-BqLqebbp.js
// Export mapping:
//   n -> SheetSyncButtons   (Open Sheet / Push / Pull)
//   t -> OpenSheetLink      ("Open Google Sheet" link, renders nothing when no sheet)
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSheetStatus, pullLeadsFromSheet, pushLeadsToSheet } from "@/lib/live/sheets.functions";

function useSheetStatus() {
  const fetchStatus = useServerFn(getSheetStatus);
  return useQuery({ queryKey: ["app_settings", "google_sheet"], queryFn: () => fetchStatus({}) });
}

export function OpenSheetLink({ className }: { className?: string }) {
  const { data } = useSheetStatus();
  if (!data?.url) return null;
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer"
      className={className ?? "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"}
    >
      <ExternalLink className="h-3.5 w-3.5" /> Open Google Sheet
    </a>
  );
}

export function SheetSyncButtons() {
  const { data } = useSheetStatus();
  const qc = useQueryClient();
  const push = useServerFn(pushLeadsToSheet);
  const pull = useServerFn(pullLeadsFromSheet);
  const [busy, setBusy] = useState<null | "push" | "pull">(null);
  if (!data?.spreadsheetId) return null;

  async function run(kind: "push" | "pull") {
    setBusy(kind);
    try {
      if (kind === "push") {
        const r = await push({});
        toast.success(`Pushed ${r.pushed} lead(s) to Google Sheets`);
      } else {
        const r = await pull({});
        toast.success(`Pulled from sheet: ${r.inserted} new, ${r.updated} updated`);
        void qc.invalidateQueries({ queryKey: ["leads"] });
      }
      void qc.invalidateQueries({ queryKey: ["app_settings", "google_sheet"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google Sheets sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" asChild>
        <a href={data.url ?? undefined} target="_blank" rel="noreferrer">
          <ExternalLink className="mr-2 h-4 w-4" /> Open Sheet
        </a>
      </Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("push")}>
        {busy === "push" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ArrowUpFromLine className="mr-2 h-4 w-4" />
        )}
        Push
      </Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("pull")}>
        {busy === "pull" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ArrowDownToLine className="mr-2 h-4 w-4" />
        )}
        Pull
      </Button>
    </div>
  );
}

export { OpenSheetLink as SheetLink, SheetSyncButtons as SheetSync };
