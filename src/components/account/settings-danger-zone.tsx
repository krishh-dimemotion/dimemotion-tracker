import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CloudUpload, Download, Loader2, Lock, TriangleAlert } from "lucide-react";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runSheetBackup } from "@/lib/live/sheets.functions";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DangerZoneInfo = {
  workspace: {
    id: string;
    name: string | null;
    isOwner: boolean;
    isAdmin: boolean;
    isLegacy: boolean;
    otherMembers: number;
  };
  owned: { id: string; name: string }[];
  hasSheet: boolean;
  accountProtected: boolean;
  blockingWorkspaces: string[];
};

// TODO: server-only handlers (hashed in the live build). Stubs keep the UI wiring intact.
export const getDangerZone = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async (): Promise<DangerZoneInfo> => {
  throw new Error("TODO: getDangerZone server function not ported");
});
export const deleteWorkspace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { confirmName: string }) => d)
  .handler(async (): Promise<{ backedUp: boolean }> => {
    throw new Error("TODO: deleteWorkspace server function not ported");
  });
export const deleteAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: "DELETE" }) => d)
  .handler(async (): Promise<void> => {
    throw new Error("TODO: deleteAccount server function not ported");
  });
export const exportWorkspaceData = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(
  async (): Promise<{ workspaceName: string; sheets: { label: string; rows: Record<string, unknown>[] }[] }> => {
    throw new Error("TODO: exportWorkspaceData server function not ported");
  },
);
// Same server fn the Users and access section uses (Gn in the live chunk).
export const leaveWorkspace = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: true }) => d)
  .handler(async (): Promise<{ createdOwn: boolean }> => {
    throw new Error("TODO: leaveWorkspace server function not ported");
  });

export function DangerZoneSettings() {
  const { signOut } = useAuth();
  const fetchInfo = useServerFn(getDangerZone);
  const { data, isLoading } = useQuery({ queryKey: ["danger_zone"], queryFn: () => fetchInfo({}) });
  const backup = useServerFn(runSheetBackup);
  const delWorkspace = useServerFn(deleteWorkspace);
  const delAccount = useServerFn(deleteAccount);
  const leave = useServerFn(leaveWorkspace);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const exportData = useServerFn(exportWorkspaceData);
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState<"workspace" | "account" | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"backup" | "workspace" | "account" | null>(null);

  if (isLoading || !data) return <div className="label-text">Loading…</div>;

  const ws = data.workspace;
  const toggle = (which: "workspace" | "account") => {
    setTyped("");
    setOpen((cur) => (cur === which ? null : which));
  };

  const runBackup = async () => {
    setBusy("backup");
    try {
      await backup({});
      toast.success("Backed up to your Google Sheet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const res = await exportData({});
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      for (const s of res.sheets) {
        const sheet = s.rows.length ? XLSX.utils.json_to_sheet(s.rows) : XLSX.utils.aoa_to_sheet([["No data"]]);
        XLSX.utils.book_append_sheet(book, sheet, s.label.slice(0, 31));
      }
      const slug =
        res.workspaceName
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-") || "workspace";
      XLSX.writeFile(book, `tracker-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Your data was downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't download your data");
    } finally {
      setDownloading(false);
    }
  };

  const doLeave = async () => {
    setLeaving(true);
    try {
      const res = await leave({ data: { confirm: true } });
      toast.success(
        res.createdOwn ? "You left the workspace. We made you a workspace of your own." : "You left the workspace",
      );
      window.location.assign("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't leave the workspace");
      setLeaving(false);
    }
  };

  const doDeleteWorkspace = async () => {
    setBusy("workspace");
    try {
      const res = await delWorkspace({ data: { confirmName: typed } });
      toast.success(
        res.backedUp ? "Workspace deleted. A final backup was saved to your Google Sheet." : "Workspace deleted",
      );
      window.location.assign("/");
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Could not delete the workspace");
    }
  };

  const doDeleteAccount = async () => {
    setBusy("account");
    try {
      await delAccount({ data: { confirm: "DELETE" } });
      await signOut().catch(() => undefined);
      window.location.assign("/auth");
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Could not delete the account");
    }
  };

  const otherOwned = data.owned.filter((w) => w.id !== ws.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-warning bg-card px-3 py-3">
        <div className="flex gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="text-[13px] font-medium">
              Please back up your leads before you delete your workspace or account.
            </div>
            <div className="label-text mt-0.5">
              Deleting is permanent and can't be undone.
              {data.hasSheet
                ? " Your Google Sheet stays in your Drive, and we save one last backup to it right before deleting."
                : " You can export your leads from the Data section, or connect Google above to keep a copy in your own sheet."}
            </div>
          </div>
        </div>
        {data.hasSheet && (
          <Button size="sm" variant="outline" onClick={runBackup} disabled={busy !== null}>
            {busy === "backup" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <CloudUpload className="mr-2 size-4" />
            )}
            Back up now
          </Button>
        )}
      </div>

      {(ws.isOwner || ws.isAdmin) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <div className="text-[13px] font-medium">Download all my data</div>
            <div className="label-text">
              Every lead, follow-up, CRM record and setting in this workspace, as one Excel file.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => void download()} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Download
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium">
              {ws.isOwner ? "Delete workspace" : "Leave workspace"}
              {ws.name ? `: ${ws.name}` : ""}
            </div>
            <div className="label-text">
              {ws.isOwner
                ? "Deletes every lead, CRM record, follow-up and setting in this workspace."
                : "You'll lose access to this workspace and its Google Sheet. The owner can invite you again."}
            </div>
          </div>
          {ws.isLegacy && ws.isOwner ? (
            <div className="label-text inline-flex items-center gap-1.5">
              <Lock className="size-3.5" /> This workspace is protected
            </div>
          ) : ws.isOwner ? (
            ws.otherMembers > 0 ? (
              <div className="label-text">
                Remove the other {ws.otherMembers === 1 ? "member" : `${ws.otherMembers} members`} first (Users and
                access).
              </div>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => toggle("workspace")} disabled={busy !== null}>
                Delete workspace
              </Button>
            )
          ) : confirmLeave ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)} disabled={leaving}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void doLeave()} disabled={leaving}>
                {leaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Yes, leave
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmLeave(true)}>
              Leave workspace
            </Button>
          )}
        </div>
        {open === "workspace" && ws.isOwner && !ws.isLegacy && ws.otherMembers === 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
            <div className="label-text">
              Type <span className="font-medium text-foreground">{ws.name}</span> to confirm.
              {otherOwned.length === 0 &&
                " This is your only workspace. Your account stays, and you can create a new workspace after."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-0 flex-1 sm:min-w-[220px]"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={doDeleteWorkspace}
                disabled={busy !== null || typed.trim() !== (ws.name ?? "").trim()}
              >
                {busy === "workspace" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Delete forever
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium">Delete my account</div>
            <div className="label-text">
              Deletes your login and every workspace you own. You'll be removed from workspaces you joined.
            </div>
          </div>
          {data.accountProtected ? (
            <div className="label-text inline-flex items-center gap-1.5">
              <Lock className="size-3.5" /> This account is protected
            </div>
          ) : data.blockingWorkspaces.length > 0 ? (
            <div className="label-text max-w-[320px]">
              You own {data.blockingWorkspaces.map((n) => `"${n}"`).join(", ")}, which still has other members. Remove
              them or delete that workspace first.
            </div>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => toggle("account")} disabled={busy !== null}>
              Delete account
            </Button>
          )}
        </div>
        {open === "account" && !data.accountProtected && data.blockingWorkspaces.length === 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3">
            {data.owned.length > 0 && (
              <div className="label-text">
                These workspaces will be deleted: {data.owned.map((w) => w.name).join(", ")}.
              </div>
            )}
            <div className="label-text">
              Type <span className="font-medium text-foreground">DELETE</span> to confirm.
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-0 flex-1 sm:min-w-[220px]"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={doDeleteAccount}
                disabled={busy !== null || typed.trim() !== "DELETE"}
              >
                {busy === "account" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Delete my account forever
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
