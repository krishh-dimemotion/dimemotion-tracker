import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAutoBackupSettings,
  runSheetBackup,
  setAutoBackupSettings,
  type AutoBackupSettings as AutoBackup,
} from "@/lib/live/sheets.functions";

type Backup = AutoBackup & { lastStatus?: "ok" | "error" | null; lastError?: string | null };
const KEY = ["app_settings", "auto_backup"];

export function AutoBackupSettings() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getAutoBackupSettings);
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => fetchSettings({}) as Promise<Backup>,
  });
  const save = useServerFn(setAutoBackupSettings);
  const backup = useServerFn(runSheetBackup);
  const [running, setRunning] = useState(false);

  async function setEnabled(enabled: boolean) {
    try {
      await save({ data: { enabled, interval: data?.interval ?? "1h" } });
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update backup settings");
    }
  }
  async function setInterval(interval: string) {
    try {
      await save({ data: { enabled: data?.enabled ?? true, interval } });
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update backup settings");
    }
  }
  async function runNow() {
    setRunning(true);
    try {
      await backup({});
      toast.success("Google Sheets backup completed");
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed. Your app data is safe.");
      await qc.invalidateQueries({ queryKey: KEY });
    } finally {
      setRunning(false);
    }
  }

  if (isLoading) return <div className="label-text">Loading backup settings…</div>;
  if (error)
    return (
      <div className="rounded-md border border-warning bg-card px-3 py-2 text-warning">
        Could not load backup settings: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={data?.enabled ?? true} onChange={(e) => void setEnabled(e.target.checked)} />{" "}
          Automatic backup enabled
        </label>
        <select
          className="h-8 rounded-md border border-border bg-background px-2"
          value={data?.interval ?? "1h"}
          onChange={(e) => void setInterval(e.target.value)}
        >
          <option value="1h">Every hour</option>
          <option value="daily">Daily</option>
        </select>
        <Button size="sm" variant="outline" disabled={running} onClick={runNow}>
          {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Back up now
        </Button>
      </div>
      <div className="label-text">
        Last automatic backup: {data?.lastRunAt ? new Date(data.lastRunAt).toLocaleString() : "Not yet run"}
      </div>
      {data?.lastStatus === "error" && (
        <div className="rounded-md border border-warning bg-card px-3 py-2 text-warning">
          Backup failed: {data.lastError || "Google Sheets could not complete the backup."} Your app data is safe.
        </div>
      )}
      {data?.lastStatus === "ok" && <div className="label-text">Status: Backup completed successfully.</div>}
    </div>
  );
}
