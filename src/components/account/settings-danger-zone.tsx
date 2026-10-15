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

async function loadInfo(context: unknown): Promise<DangerZoneInfo> {
  const { ctxOf, currentWorkspace, isAdminRole, readSetting } = await import("@/lib/live/server-ctx");
  const { sb, userId } = ctxOf(context);
  const { workspaceId, role } = await currentWorkspace(sb, userId);
  const { data: ws } = await sb.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle();
  const { data: members } = await sb.from("workspace_members").select("user_id").eq("workspace_id", workspaceId);
  const { data: mine } = await sb
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name)")
    .eq("user_id", userId)
    .eq("role", "owner");
  const owned = (mine ?? []).map((m) => {
    const w = (Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces) as { id: string; name: string } | null;
    return { id: m.workspace_id as string, name: w?.name ?? "Workspace" };
  });
  const blockingWorkspaces: string[] = [];
  for (const o of owned) {
    const { count } = await sb
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", o.id)
      .neq("user_id", userId);
    if ((count ?? 0) > 0) blockingWorkspaces.push(o.name);
  }
  const sheet = await readSetting<{ url?: string | null }>(sb, workspaceId, "google_sheet");
  return {
    workspace: {
      id: workspaceId,
      name: (ws?.name as string | undefined) ?? null,
      isOwner: role === "owner",
      isAdmin: isAdminRole(role),
      isLegacy: false,
      otherMembers: (members ?? []).filter((m) => m.user_id !== userId).length,
    },
    owned,
    hasSheet: Boolean(sheet?.url),
    accountProtected: false,
    blockingWorkspaces,
  };
}

/** Moves the caller to another workspace they belong to, or creates one. */
async function moveToOtherWorkspace(context: unknown, excludeId: string): Promise<{ createdOwn: boolean }> {
  const { ctxOf } = await import("@/lib/live/server-ctx");
  const { sb, userId } = ctxOf(context);
  const { data: other } = await sb
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .neq("workspace_id", excludeId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (other?.workspace_id) {
    const { error } = await sb.rpc("switch_workspace", { _ws: other.workspace_id });
    if (error) throw new Error(error.message);
    return { createdOwn: false };
  }
  const { error } = await sb.rpc("create_workspace", { _name: "My workspace" });
  if (error) throw new Error(error.message);
  return { createdOwn: true };
}

async function deleteWorkspaceRows(workspaceId: string) {
  const { adminClient, WORKSPACE_TABLES } = await import("@/lib/live/server-ctx");
  const admin = await adminClient();
  for (const t of WORKSPACE_TABLES) {
    const { error } = await admin.from(t).delete().eq("workspace_id", workspaceId);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  for (const t of ["user_permissions", "workspace_invites", "workspace_members"]) {
    const { error } = await admin.from(t).delete().eq("workspace_id", workspaceId);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  await admin.from("profiles").update({ current_workspace_id: null }).eq("current_workspace_id", workspaceId);
  const { error } = await admin.from("workspaces").delete().eq("id", workspaceId);
  if (error) throw new Error(error.message);
}

export const getDangerZone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DangerZoneInfo> => loadInfo(context));

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirmName: string }) => d)
  .handler(async ({ data, context }): Promise<{ backedUp: boolean }> => {
    const info = await loadInfo(context);
    if (!info.workspace.isOwner) throw new Error("Only the workspace owner can delete it.");
    if ((data.confirmName ?? "").trim() !== (info.workspace.name ?? "").trim())
      throw new Error("The name you typed does not match this workspace.");
    await moveToOtherWorkspace(context, info.workspace.id);
    await deleteWorkspaceRows(info.workspace.id);
    return { backedUp: false };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: "DELETE" }) => d)
  .handler(async ({ data, context }): Promise<void> => {
    if (data.confirm !== "DELETE") throw new Error('Type DELETE to confirm.');
    const { ctxOf, adminClient } = await import("@/lib/live/server-ctx");
    const { userId } = ctxOf(context);
    const info = await loadInfo(context);
    if (info.blockingWorkspaces.length)
      throw new Error(
        `You still own workspaces with other members (${info.blockingWorkspaces.join(", ")}). Delete them or remove the members first.`,
      );
    for (const w of info.owned) await deleteWorkspaceRows(w.id);
    const admin = await adminClient();
    await admin.from("workspace_members").delete().eq("user_id", userId);
    await admin.from("user_permissions").delete().eq("user_id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  });

const EXPORT_SHEETS: { table: string; label: string }[] = [
  { table: "leads", label: "Leads" },
  { table: "lead_contacts", label: "Contacts" },
  { table: "lead_links", label: "Links" },
  { table: "lead_followups", label: "Follow-ups" },
  { table: "lead_tasks", label: "To-dos" },
  { table: "lead_tags", label: "Lead tags" },
  { table: "lead_events", label: "Activity" },
  { table: "crm_records", label: "CRM deals" },
  { table: "crm_contact_log", label: "CRM contact log" },
  { table: "stages", label: "Stages" },
  { table: "channels", label: "Channels" },
  { table: "sender_accounts", label: "Sender accounts" },
  { table: "countries", label: "Countries" },
  { table: "tags", label: "Tags" },
  { table: "outreach_targets", label: "Outreach targets" },
  { table: "outreach_daily", label: "Outreach daily" },
  { table: "outreach_templates", label: "Outreach templates" },
  { table: "followup_templates", label: "Follow-up templates" },
  { table: "import_mappings", label: "Import mappings" },
];

export const exportWorkspaceData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }): Promise<{ workspaceName: string; sheets: { label: string; rows: Record<string, any>[] }[] }> => {
    const { ctxOf, currentWorkspace } = await import("@/lib/live/server-ctx");
    const { sb, userId } = ctxOf(context);
    const { workspaceId } = await currentWorkspace(sb, userId);
    const { data: ws } = await sb.from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheets: { label: string; rows: Record<string, any>[] }[] = [];
    for (const { table, label } of EXPORT_SHEETS) {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(table).select("*").eq("workspace_id", workspaceId).range(from, from + 999);
        if (error) throw new Error(`${label}: ${error.message}`);
        rows.push(...((data ?? []) as Record<string, unknown>[]));
        if (!data || data.length < 1000) break;
      }
      sheets.push({ label, rows });
    }
    return { workspaceName: (ws?.name as string | undefined) ?? "Workspace", sheets };
  });

// Same server fn the Users and access section uses (Gn in the live chunk).
export const leaveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: true }) => d)
  .handler(async ({ context }): Promise<{ createdOwn: boolean }> => {
    const { ctxOf, currentWorkspace } = await import("@/lib/live/server-ctx");
    const { sb, userId } = ctxOf(context);
    const { workspaceId, role } = await currentWorkspace(sb, userId);
    if (role === "owner") throw new Error("Owners cannot leave their own workspace. Delete it instead.");
    const res = await moveToOtherWorkspace(context, workspaceId);
    const { adminClient } = await import("@/lib/live/server-ctx");
    const admin = await adminClient();
    const { error } = await admin.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    await admin.from("user_permissions").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
    return res;
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
