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
// TODO(server): every handler below is server-only code that the client
// bundle does not contain. The older Lovable-gateway implementation still
// lives in src/lib/sheets.functions.ts (getSheetStatus / syncLeadsToSheet)
// and is the starting point for porting these.
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

const notReady = (what: string) =>
  new Error(`${what} is not set up on this server yet.`);

export const getSheetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SheetStatus> => {
    // TODO(server): read app_settings key `google_sheet` for this workspace.
    return { url: null, tab: null, spreadsheetId: null, lastSyncAt: null };
  });

export const connectSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; tab: string }) => d)
  .handler(async (): Promise<SheetStatus> => {
    throw notReady("Connecting a Google Sheet");
  });

export const testSheetConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ title: string; sheets: string[] }> => {
    throw notReady("Google Sheets test");
  });

export const pushLeadsToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ pushed: number }> => {
    throw notReady("Push to Google Sheets");
  });

export const pullLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ inserted: number; updated: number }> => {
    throw notReady("Pull from Google Sheets");
  });

export const runSheetBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true }> => {
    throw notReady("Google Sheets backup");
  });

export const getAutoBackupSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AutoBackupSettings> => {
    // TODO(server): read app_settings key `auto_backup`.
    return { enabled: false, interval: "1h", lastRunAt: null };
  });

export const setAutoBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean; interval: string }) => d)
  .handler(async (): Promise<{ ok: true }> => {
    throw notReady("Automatic backup");
  });

export const syncLeadToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => d)
  .handler(async (): Promise<{ ok: true }> => {
    // TODO(server): upsert one lead row into the connected sheet.
    return { ok: true };
  });
