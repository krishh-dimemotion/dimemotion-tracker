import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSheetStatus, syncLeadsToSheet } from "@/lib/sheets.functions";

export function GoogleSheetCard() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getSheetStatus);
  const runSync = useServerFn(syncLeadsToSheet);

  const status = useQuery({
    queryKey: ["google_sheet_status"],
    queryFn: () => fetchStatus(),
  });

  const sync = useMutation({
    mutationFn: () => runSync(),
    onSuccess: (res) => {
      toast.success(`Saved ${res.lastRowCount} leads to your Google Sheet`);
      qc.invalidateQueries({ queryKey: ["google_sheet_status"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const sheet = status.data?.sheet ?? null;
  const connected = status.data?.connected ?? false;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Keeps a copy of every lead in a Google Sheet. Run a sync whenever you want the sheet brought up to date.
      </p>

      {!connected && (
        <p className="text-sm text-destructive">Google is not connected yet for this app.</p>
      )}

      {sheet?.spreadsheetUrl && (
        <a
          href={sheet.spreadsheetUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 text-sm text-primary hover:underline"
        >
          Open the backup sheet <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      <p className="text-sm text-muted-foreground">
        {sheet?.lastSyncedAt
          ? `Last saved ${new Date(sheet.lastSyncedAt).toLocaleString()} with ${sheet.lastRowCount} leads.`
          : "Not saved yet. The first sync creates the sheet for you."}
      </p>

      <Button
        className="w-fit"
        onClick={() => sync.mutate()}
        disabled={sync.isPending || !connected}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
        {sync.isPending ? "Saving..." : "Sync to Google Sheet"}
      </Button>
    </div>
  );
}
