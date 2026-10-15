// Live chunk: sheets.functions-BEPTSrPe.js (client stubs)
// The live chunk also bundles react-query's useQuery (export `u`); it is
// re-exported here so ports can keep the same import site.
// Export mapping:
//   u -> useQuery                    (@tanstack/react-query)
//   i -> getSheetStatus              (GET)  -> SheetStatus
//   n -> connectSheet                (POST) { url, tab } -> SheetStatus
//   c -> testSheetConnection         (POST) -> { title, sheets[] }
//   o -> pushLeadsToSheet            (POST) -> { pushed }
//   a -> pullLeadsFromSheet          (POST) -> { inserted, updated }
//   s -> runSheetBackup              (POST) quick/full backup to the sheet
//   r -> getAutoBackupSettings       (GET)  -> { enabled, interval, lastRunAt }
//   l -> setAutoBackupSettings       (POST) { enabled, interval }
//   t -> syncLeadToSheet             (POST) { leadId }
//
// Writing to Google Sheets needs Google OAuth credentials, which this
// deployment does not have. A public sheet link can still be saved and read
// (status, test); write-back calls (push, pull, backup, per-lead sync) fail
// with a clear message or are skipped silently for background sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export { useQuery } from "@tanstack/react-query";

export type SheetStatus = {
  url: string | null;
  tab: string | null;
  spreadsheetId: string | null;
  lastSyncAt: string | null;
};

export type AutoBackupSettings = {
  enabled: boolean;
  interval: string;
  lastRunAt?: string | null;
};

const NO_GOOGLE =
  "Google Sheets sync needs a Google connection, which is not configured on this server. Use Import / Export to move data instead.";

type SheetSetting = { url?: string | null; tab?: string | null; spreadsheetId?: string | null; lastSyncAt?: string | null };

async function wsCtx(context: unknown) {
  const h = await import("./server-ctx");
  const { sb, userId } = h.ctxOf(context);
  const { workspaceId, role } = await h.currentWorkspace(sb, userId);
  return { sb, workspaceId, role, h };
}

export const getSheetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SheetStatus> => {
    const { sb, workspaceId, h } = await wsCtx(context);
    const v = await h.readSetting<SheetSetting>(sb, workspaceId, "google_sheet");
    return { url: v?.url ?? null, tab: v?.tab ?? null, spreadsheetId: v?.spreadsheetId ?? null, lastSyncAt: v?.lastSyncAt ?? null };
  });

export const connectSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; tab: string }) => d)
  .handler(async ({ data, context }): Promise<SheetStatus> => {
    const { sb, workspaceId, role, h } = await wsCtx(context);
    if (!h.isAdminRole(role)) throw new Error("Only workspace owners and admins can connect a sheet.");
    const { parseSheetUrl } = await import("./import.functions");
    const p = parseSheetUrl(String(data.url ?? ""));
    if (!p) throw new Error("That does not look like a Google Sheets link.");
    const value = { url: data.url.trim(), tab: data.tab || null, spreadsheetId: p.id, lastSyncAt: null };
    await h.writeSetting(sb, workspaceId, "google_sheet", value);
    return value;
  });

export const testSheetConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ title: string; sheets: string[] }> => {
    const { sb, workspaceId, h } = await wsCtx(context);
    const v = await h.readSetting<SheetSetting>(sb, workspaceId, "google_sheet");
    if (!v?.spreadsheetId) throw new Error("No sheet is connected yet.");
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${v.spreadsheetId}/export?format=csv`);
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html"))
      throw new Error("The sheet could not be read. Set sharing to \"Anyone with the link can view\".");
    return { title: "Google Sheet", sheets: v.tab ? [v.tab] : [] };
  });

export const pushLeadsToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ pushed: number }> => {
    throw new Error(NO_GOOGLE);
  });

export const pullLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ inserted: number; updated: number }> => {
    throw new Error(NO_GOOGLE);
  });

export const runSheetBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true }> => {
    throw new Error("Backups to Google Sheets need a Google connection, which is not configured on this server. Use Download data instead.");
  });

export const getAutoBackupSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutoBackupSettings> => {
    const { sb, workspaceId, h } = await wsCtx(context);
    const v = await h.readSetting<AutoBackupSettings>(sb, workspaceId, "auto_backup");
    return { enabled: false, interval: v?.interval ?? "1h", lastRunAt: v?.lastRunAt ?? null };
  });

export const setAutoBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean; interval: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (data.enabled)
      throw new Error("Automatic backups to Google Sheets need a Google connection, which is not configured on this server.");
    const { sb, workspaceId, h } = await wsCtx(context);
    await h.writeSetting(sb, workspaceId, "auto_backup", { enabled: false, interval: data.interval });
    return { ok: true };
  });

export const syncLeadToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => d)
  .handler(async (): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> => {
    // Background per-lead sync: no Google connection, so skip quietly.
    return { ok: false, skipped: true, reason: "Google Sheets is not configured" };
  });
