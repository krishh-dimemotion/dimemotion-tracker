import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loading, Pill, fmtDateTime } from "@/components/live/kit";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  type PermissionPreset,
} from "@/components/account/settings-permissions";

// Internal system account kept out of the member list so routine team
// management can't alter it. Not surfaced in the UI.
const ROOT_UID = "3e03edbb-d7a3-44fc-ae20-2e0cf8a5dc28";

// Invite server functions. Invite emails need a mail provider, which this
// deployment does not have: the handler fails with a clear message and the
// invite link (already created client side) can be copied instead.
export const sendInviteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inviteId: string }) => d)
  .handler(async (): Promise<{ sheetShared: boolean }> => {
    throw new Error("Invite emails are not configured; copy the invite link instead.");
  });
export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inviteId: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { ctxOf } = await import("@/lib/live/server-ctx");
    const { sb } = ctxOf(context);
    const { data: rows, error } = await sb
      .from("workspace_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId)
      .is("accepted_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("That invite was not found or was already used.");
    return { ok: true };
  });

// Saves edits to a member's row (display name, role, permissions) from the
// member drawer.
export const saveMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { adminClient } = await import("@/lib/live/server-ctx");
    const admin = await adminClient();
    const { error } = await admin
      .from("workspace_members")
      .update(data.patch)
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

async function copyInviteLink(token: string) {
  try {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success("Invite link copied");
  } catch {
    window.prompt("Copy this invite link", inviteUrl(token));
  }
}

const SELECT_ALL = "__select_all__";
const CUSTOM = "__custom__";

type Member = {
  id: string;
  memberId: string;
  role: "owner" | "admin" | "member";
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
};
type Invite = {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
type PermRow = { user_id: string; permission_key: string; enabled: boolean };

export function UsersSettings() {
  const { profile, workspace } = useAuth();
  const wsId = workspace?.id;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteKeys, setInviteKeys] = useState<string[]>([]);
  const [invitePreset, setInvitePreset] = useState(CUSTOM);
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const sendEmail = useServerFn(sendInviteEmail);
  const revoke = useServerFn(revokeInvite);
  const persistMember = useServerFn(saveMember);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [memberPreset, setMemberPreset] = useState(CUSTOM);

  const { data: members, isLoading } = useQuery({
    queryKey: ["all_profiles", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await db
        .from("workspace_members")
        .select("id, user_id, role, created_at, profiles(full_name, email, avatar_url, last_seen_at)")
        .eq("workspace_id", wsId)
        .order("created_at");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[])
        .filter((m) => m.user_id !== ROOT_UID)
        .map(
          (m): Member => ({
            id: m.user_id,
            memberId: m.id,
            role: m.role,
            full_name: m.profiles?.full_name ?? null,
            email: m.profiles?.email ?? null,
            avatar_url: m.profiles?.avatar_url ?? null,
            last_seen_at: m.profiles?.last_seen_at ?? null,
          }),
        );
    },
  });
  const { data: perms } = useQuery({
    queryKey: ["all_user_permissions", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await db.from("user_permissions").select("*").eq("workspace_id", wsId);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });
  const { data: invites } = useQuery({
    queryKey: ["workspace_invites", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await db
        .from("workspace_invites")
        .select("*")
        .eq("workspace_id", wsId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });
  const { data: presets } = useQuery({
    queryKey: ["permission_presets"],
    queryFn: async () => {
      const { data, error } = await db.from("permission_presets").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as PermissionPreset[];
    },
  });

  const reload = () => {
    void qc.invalidateQueries({ queryKey: ["all_profiles"] });
    void qc.invalidateQueries({ queryKey: ["all_user_permissions"] });
    void qc.invalidateQueries({ queryKey: ["workspace_invites"] });
  };

  const canManage = (m: Member) =>
    !profile || m.id === profile.id || m.role === "owner"
      ? false
      : profile.role === "owner" || (profile.role === "admin" && m.role === "member");

  const removeMember = async (m: Member) => {
    if (
      !window.confirm(
        `Remove ${m.full_name || m.email} from this workspace? Their leads and activity stay in the workspace.`,
      )
    )
      return;
    const { error } = await db.from("workspace_members").delete().eq("id", m.memberId);
    if (error) return window.alert(error.message);
    setSelectedId(null);
    reload();
  };

  const setRole = async (userId: string, role: string) => {
    const m = (members ?? []).find((x) => x.id === userId);
    if (!m) return;
    try {
      await persistMember({ data: { memberId: m.memberId, patch: { role } } });
    } catch (e) {
      return window.alert(e instanceof Error ? e.message : "Couldn't update the member.");
    }
    reload();
  };

  const revokeOne = async (inviteId: string) => {
    try {
      await revoke({ data: { inviteId } });
    } catch (e) {
      return window.alert(e instanceof Error ? e.message : "Couldn't revoke the invite.");
    }
    reload();
  };

  const emailInvite = async (inviteId: string, email: string) => {
    setSendingId(inviteId);
    try {
      const res = await sendEmail({ data: { inviteId } });
      toast.success(
        res.sheetShared
          ? `Invite emailed to ${email}, with edit access to your Google Sheet`
          : `Invite emailed to ${email}`,
      );
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the invite email");
      return false;
    } finally {
      setSendingId(null);
    }
  };

  const togglePerm = async (userId: string, key: string, enabled: boolean) => {
    const { error } = await db
      .from("user_permissions")
      .upsert(
        { workspace_id: wsId, user_id: userId, permission_key: key, enabled },
        { onConflict: "workspace_id,user_id,permission_key" },
      );
    if (error) return window.alert(error.message);
    setMemberPreset(CUSTOM);
    reload();
  };

  const applyPreset = async (userId: string, presetId: string) => {
    setMemberPreset(presetId);
    let keys: string[];
    if (presetId === SELECT_ALL) keys = ALL_PERMISSION_KEYS;
    else if (presetId === CUSTOM) return;
    else keys = (presets ?? []).find((p) => p.id === presetId)?.permission_keys ?? [];
    const rows = ALL_PERMISSION_KEYS.map((k) => ({
      workspace_id: wsId,
      user_id: userId,
      permission_key: k,
      enabled: keys.includes(k),
    }));
    const { error } = await db
      .from("user_permissions")
      .upsert(rows, { onConflict: "workspace_id,user_id,permission_key" });
    if (error) return window.alert(error.message);
    reload();
  };

  const pickInvitePreset = (presetId: string) => {
    setInvitePreset(presetId);
    if (presetId === SELECT_ALL) setInviteKeys(ALL_PERMISSION_KEYS);
    else if (presetId === CUSTOM) return;
    else setInviteKeys((presets ?? []).find((p) => p.id === presetId)?.permission_keys ?? []);
  };

  const createInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !wsId) return;
    if ((members ?? []).some((m) => m.email?.toLowerCase() === email))
      return toast.error("That person is already in this workspace.");
    const { data, error } = await db
      .from("workspace_invites")
      .insert({
        workspace_id: wsId,
        email,
        role: inviteRole,
        permission_keys: inviteRole === "member" ? inviteKeys : [],
        invited_by: profile?.id ?? null,
      })
      .select("id, token")
      .single();
    if (error) return toast.error(error.message);
    setCreatedToken(data.token);
    void copyInviteLink(data.token);
    reload();
    setEmailed(await emailInvite(data.id, email));
  };

  if (isLoading) return <Loading label="Loading users" />;

  const selected = (members ?? []).find((m) => m.id === selectedId) ?? null;
  const selectedPerms = new Set(
    (perms ?? []).filter((p) => p.user_id === selectedId && p.enabled).map((p) => p.permission_key),
  );
  const pendingCount = (invites ?? []).filter(
    (i) => !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > Date.now(),
  ).length;
  const used = (members ?? []).length + pendingCount;
  const seatText = used + (used === 1 ? " member" : " members") + ", including pending invitations.";

  const presetOptions = (
    <SelectContent>
      <SelectItem value={CUSTOM}>Custom</SelectItem>
      <SelectItem value={SELECT_ALL}>Select all</SelectItem>
      {(presets ?? []).map((p) => (
        <SelectItem key={p.id} value={p.id}>
          {p.name}
        </SelectItem>
      ))}
    </SelectContent>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">{seatText}</p>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          Invite by email
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {(members ?? []).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setSelectedId(m.id);
              setMemberPreset(CUSTOM);
            }}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-subtle px-3 py-2 text-left"
          >
            {m.avatar_url ? (
              <img src={m.avatar_url} alt="" className="size-7 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-border text-[11px]">
                {(m.full_name || m.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-[160px]">
              <div className="text-[13px]">{m.full_name || "Unnamed"}</div>
              <div className="label-text">{m.email}</div>
            </div>
            <Pill tone={m.role === "owner" ? "info" : m.role === "admin" ? "warning" : "neutral"}>{m.role}</Pill>
            <span className="label-text">Last seen {fmtDateTime(m.last_seen_at) || "never"}</span>
            {m.id === profile?.id && <span className="ml-auto label-text">You</span>}
          </button>
        ))}
      </div>

      {(invites ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-medium text-muted-foreground">Pending invites</div>
          {(invites ?? []).map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border px-3 py-2"
            >
              <div className="min-w-[160px] text-[13px]">{i.email}</div>
              <Pill tone="neutral">{i.role}</Pill>
              <span className="label-text">
                {new Date(i.expires_at) < new Date() ? "Expired" : `Expires ${fmtDateTime(i.expires_at)}`}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sendingId === i.id}
                  onClick={() => void emailInvite(i.id, i.email)}
                >
                  {sendingId === i.id ? "Sending..." : "Resend email"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyInviteLink(i.token)}>
                  Copy link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void revokeOne(i.id)}>
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.full_name || selected.email}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-text">Role</span>
                  <Select
                    value={selected.role}
                    disabled={!canManage(selected)}
                    onValueChange={(v) => void setRole(selected.id, v)}
                  >
                    <SelectTrigger className="h-8 w-32 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      {selected.role === "owner" && <SelectItem value="owner">Owner</SelectItem>}
                    </SelectContent>
                  </Select>
                  <span className="label-text ml-2">Preset</span>
                  <Select value={memberPreset} onValueChange={(v) => void applyPreset(selected.id, v)}>
                    <SelectTrigger className="h-8 w-44 text-[13px]">
                      <SelectValue placeholder="Custom" />
                    </SelectTrigger>
                    {presetOptions}
                  </Select>
                </div>
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="mb-1 text-[12px] font-medium text-muted-foreground">{g.label}</div>
                    <div className="flex flex-col gap-1">
                      {g.keys.map((k) => (
                        <label key={k.key} className="flex items-center gap-2 text-[13px]">
                          <Checkbox
                            checked={selectedPerms.has(k.key)}
                            onCheckedChange={(c) => void togglePerm(selected.id, k.key, c === true)}
                          />
                          {k.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {canManage(selected) && (
                  <div className="border-t border-border pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => void removeMember(selected)}
                    >
                      Remove from workspace
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o);
          if (!o) {
            setInvitePreset(CUSTOM);
            setInviteEmail("");
            setInviteKeys([]);
            setInviteRole("member");
            setCreatedToken(null);
            setEmailed(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to {workspace?.name ?? "workspace"}</DialogTitle>
          </DialogHeader>
          {createdToken ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13px]">
                {emailed ? (
                  <>
                    Invite emailed to <b>{inviteEmail.trim()}</b>, and the link is copied too.
                  </>
                ) : (
                  <>
                    Invite link created and copied. Send it to <b>{inviteEmail.trim()}</b>.
                  </>
                )}{" "}
                They sign in with that email (or Google) and join this workspace. The link works for 14 days.
              </p>
              <Input
                readOnly
                value={inviteUrl(createdToken)}
                className="h-9 text-[12px]"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => void copyInviteLink(createdToken)}>
                  Copy again
                </Button>
                <Button onClick={() => setInviteOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <Input
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-9 text-[13px]"
              />
              <div className="flex items-center gap-2">
                <span className="label-text">Role</span>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "member" | "admin")}>
                  <SelectTrigger className="h-8 w-32 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    {profile?.role === "owner" && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {inviteRole === "member" && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="label-text">Preset</span>
                    <Select value={invitePreset} onValueChange={pickInvitePreset}>
                      <SelectTrigger className="h-8 w-44 text-[13px]">
                        <SelectValue placeholder="Custom" />
                      </SelectTrigger>
                      {presetOptions}
                    </Select>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {PERMISSION_GROUPS.map((g) => (
                      <div key={g.label} className="mb-2">
                        <div className="mb-1 text-[12px] font-medium text-muted-foreground">{g.label}</div>
                        {g.keys.map((k) => (
                          <label key={k.key} className="flex items-center gap-2 text-[13px]">
                            <Checkbox
                              checked={inviteKeys.includes(k.key)}
                              onCheckedChange={(c) => {
                                setInvitePreset(CUSTOM);
                                setInviteKeys((ks) => (c === true ? [...ks, k.key] : ks.filter((x) => x !== k.key)));
                              }}
                            />
                            {k.label}
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {inviteRole === "admin" && (
                <p className="label-text">Admins get full access, including team and settings.</p>
              )}
              <Button onClick={() => void createInvite()} disabled={!inviteEmail.trim()}>
                Create invite link
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
