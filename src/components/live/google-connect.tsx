// Live chunk: GoogleConnect-CjuRJLOv.js
// Export mapping:
//   r -> GoogleConnectCard        t -> ConnectGoogleButton
//   a -> useGoogleStatus          n -> GOOGLE_STATUS_QUERY_KEY
//   i -> googleConnectErrorMessage
//   c -> ExternalLinkIcon         s -> Link2Icon          o -> RefreshCwIcon
// Internal (not exported by the chunk): LegacySheetConnect, GoogleLogo.
// Server calls are stubs, see src/lib/live/google.functions.ts and
// src/lib/live/sheets.functions.ts.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ExternalLink, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { disconnectGoogle, getGoogleStatus, startGoogleConnect } from "@/lib/live/google.functions";
import {
  connectSheet,
  getSheetStatus,
  runSheetBackup,
  testSheetConnection,
} from "@/lib/live/sheets.functions";

export { ExternalLink as ExternalLinkIcon, Link2 as Link2Icon, RefreshCw as RefreshCwIcon } from "lucide-react";

const SHEET_KEY = ["app_settings", "google_sheet"];

function LegacySheetConnect() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getSheetStatus);
  const { data, isLoading, error } = useQuery({ queryKey: SHEET_KEY, queryFn: () => fetchStatus({}) });
  const connect = useServerFn(connectSheet);
  const test = useServerFn(testSheetConnection);
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("Leads");
  const [busy, setBusy] = useState<null | "connect" | "test">(null);

  async function onConnect() {
    setBusy("connect");
    try {
      const res = await connect({ data: { url: url.trim(), tab: tab.trim() || "Sheet1" } });
      setUrl("");
      qc.setQueryData(SHEET_KEY, res);
      toast.success("Google Sheet connected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect Google Sheet");
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy("test");
    try {
      const res = await test({});
      toast.success(`Google Sheets connected: ${res.title || "spreadsheet"} · ${res.sheets.length} tab(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google Sheets connection test failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isLoading ? (
        <div className="label-text">Loading sheet connection…</div>
      ) : error ? (
        <div className="rounded-md border border-warning bg-card px-3 py-2 text-warning">
          Could not load Google Sheet settings: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      ) : data?.url ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <CircleCheck className="size-4" /> Google Sheet connected
              </div>
              <div className="label-text break-all">{data.url}</div>
              <div className="label-text mt-1">
                Tab: {data.tab && data.tab.trim() !== "Sheet1" ? data.tab : "Leads"}
                {data.lastSyncAt ? ` · Last sync: ${new Date(data.lastSyncAt).toLocaleString()}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={onTest} disabled={busy !== null}>
                {busy === "test" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Test connection
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={data.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 size-4" />
                  Open Google Sheet
                </a>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="label-text">Connect the Google Sheet you want Infosized to use.</div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-0 flex-1 sm:min-w-[280px]"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste your Google Sheet URL"
            />
            <Input className="w-32" value={tab} onChange={(e) => setTab(e.target.value)} placeholder="Tab name" />
            <Button size="sm" onClick={onConnect} disabled={busy !== null || !url.trim()}>
              {busy === "connect" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 size-4" />
              )}
              Connect
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const GOOGLE_STATUS_QUERY_KEY = ["google_status"];

export function useGoogleStatus() {
  const fetchStatus = useServerFn(getGoogleStatus);
  return useQuery({ queryKey: GOOGLE_STATUS_QUERY_KEY, queryFn: () => fetchStatus({}) });
}

export function googleConnectErrorMessage(reason?: string) {
  switch (reason) {
    case "cancelled":
      return "Google wasn't connected because the Google screen was closed or cancelled.";
    case "scope":
      return "Tracker needs permission to create your sheet. When Google asks, leave the Google Drive box ticked.";
    case "expired":
      return "That took too long. Please try connecting again.";
    case "not_admin":
      return "Only workspace owners and admins can connect Google.";
    default:
      return "Something went wrong while connecting Google. Please try again.";
  }
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export function ConnectGoogleButton({
  returnTo,
  label = "Connect Google",
  variant = "default",
  className,
}: {
  returnTo: string;
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
}) {
  const start = useServerFn(startGoogleConnect);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      className={`gap-2 ${className ?? ""}`}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await start({ data: { origin: window.location.origin, returnTo } });
          window.location.assign(url);
        } catch (e) {
          setBusy(false);
          toast.error(e instanceof Error ? e.message : "Could not start Google connection");
        }
      }}
      disabled={busy}
      type="button"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <GoogleLogo />}
      {label}
    </Button>
  );
}

export function GoogleConnectCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useGoogleStatus();
  const disconnect = useServerFn(disconnectGoogle);
  const backup = useServerFn(runSheetBackup);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    params.delete("google");
    params.delete("reason");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    if (result === "connected") {
      toast.success("Google connected. Filling your sheet now.");
      backup({})
        .then(() => toast.success("Your Google Sheet is up to date"))
        .catch((e) => toast.error(e instanceof Error ? e.message : "Backup to Google Sheet failed"))
        .finally(() => {
          void qc.invalidateQueries({ queryKey: GOOGLE_STATUS_QUERY_KEY });
          void qc.invalidateQueries({ queryKey: SHEET_KEY });
        });
    } else toast.error(googleConnectErrorMessage(params.get("reason") ?? undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading || !data) return <div className="label-text">Loading Google connection…</div>;

  if (data.usesConnectedGoogle && data.connected)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <CircleCheck className="size-4" /> Connected{data.googleEmail ? ` as ${data.googleEmail}` : ""}
          </div>
          <div className="label-text mt-1">
            Your leads are backed up to a sheet in your own Google Drive.
            {data.lastSyncAt ? ` Last sync: ${new Date(data.lastSyncAt).toLocaleString()}.` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.sheetUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={data.sheetUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 size-4" />
                Open Google Sheet
              </a>
            </Button>
          )}
          {data.isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Disconnect Google? Backups to your sheet will stop. The sheet itself stays in your Google Drive.",
                  )
                )
                  return;
                setDisconnecting(true);
                try {
                  await disconnect({});
                  toast.success("Google disconnected");
                  await qc.invalidateQueries({ queryKey: GOOGLE_STATUS_QUERY_KEY });
                  await qc.invalidateQueries({ queryKey: SHEET_KEY });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not disconnect Google");
                } finally {
                  setDisconnecting(false);
                }
              }}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Unplug className="mr-2 size-4" />
              )}
              Disconnect
            </Button>
          )}
        </div>
      </div>
    );

  if (data.legacy && !data.usesConnectedGoogle)
    return (
      <div className="flex flex-col gap-4">
        <LegacySheetConnect />
        {data.isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="label-text">
              Switch to Connect Google to back up to a new sheet owned by your Google account.
            </div>
            <ConnectGoogleButton returnTo="/settings" variant="outline" />
          </div>
        )}
      </div>
    );

  if (data.usesConnectedGoogle && !data.connected)
    return (
      <div className="flex flex-col gap-3">
        <div className="label-text">
          Google needs to be reconnected. Backups to your Google Sheet are paused until then. Your data in Tracker
          is safe. Reconnect with the same Google account to keep using the same sheet.
        </div>
        {data.isAdmin ? (
          <div>
            <ConnectGoogleButton returnTo="/settings" label="Reconnect Google" />
          </div>
        ) : (
          <div className="label-text">Ask a workspace admin to reconnect Google.</div>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="label-text">
        Connect your Google account and Tracker will create a sheet in your Google Drive and keep your leads
        backed up there. Tracker can only see the sheet it creates, nothing else in your Drive.
      </div>
      {data.isAdmin ? (
        <div>
          <ConnectGoogleButton returnTo="/settings" />
        </div>
      ) : (
        <div className="label-text">Ask a workspace admin to connect Google.</div>
      )}
    </div>
  );
}
