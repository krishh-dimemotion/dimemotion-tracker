import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/format";
import { Loading, Pill } from "@/components/kit";

type Role = "owner" | "admin" | "member";

export function UsersCard() {
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState<string[]>([]);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: perms } = useQuery({
    queryKey: ["all_user_permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_permissions").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["all_profiles"] });
    qc.invalidateQueries({ queryKey: ["all_user_permissions"] });
  };

  const canEditRole = (target: { id: string; role: Role }) => {
    if (!me) return false;
    if (target.id === me.id) return false;
    if (me.role === "owner") return true;
    if (me.role === "admin") return target.role === "member";
    return false;
  };

  const setActive = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active }).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const setRole = async (id: string, role: Role) => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const togglePerm = async (userId: string, key: string, enabled: boolean) => {
    const { error } = await supabase
      .from("user_permissions")
      .upsert({ user_id: userId, permission_key: key, enabled }, { onConflict: "user_id,permission_key" });
    if (error) return window.alert(error.message);
    invalidate();
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    const id = crypto.randomUUID();
    const { error } = await supabase.from("profiles").insert({
      id,
      email: inviteEmail.trim(),
      role: "member",
      is_active: false,
    });
    if (error) return window.alert(error.message);
    if (invitePerms.length) {
      await supabase
        .from("user_permissions")
        .insert(invitePerms.map((key) => ({ user_id: id, permission_key: key, enabled: true })));
    }
    setInviteEmail("");
    setInvitePerms([]);
    setInviteOpen(false);
    invalidate();
  };

  if (isLoading) return <Loading label="Loading users" />;

  const selectedUser = (profiles ?? []).find((p) => p.id === selected) ?? null;
  const selectedPerms = new Set(
    (perms ?? []).filter((p) => p.user_id === selected && p.enabled).map((p) => p.permission_key),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          Invite by email
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {(profiles ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-subtle px-3 py-2 text-left"
          >
            {p.avatar_url ? (
              <img src={p.avatar_url} alt="" className="size-7 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-border text-[11px]">
                {(p.full_name || p.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-[160px]">
              <div className="text-[13px]">{p.full_name || "Unnamed"}</div>
              <div className="label-text">{p.email}</div>
            </div>
            <Pill tone={p.role === "owner" ? "info" : p.role === "admin" ? "warning" : "neutral"}>{p.role}</Pill>
            <span className="label-text">Last seen {fmtDateTime(p.last_seen_at) || "never"}</span>
            <label
              className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {p.is_active ? "Active" : "Pending"}
              <Switch checked={p.is_active} onCheckedChange={(v) => setActive(p.id, v)} />
            </label>
          </button>
        ))}
      </div>

      <Dialog open={!!selectedUser} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {selectedUser && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedUser.full_name || selectedUser.email}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="label-text">Role</span>
                  <Select
                    value={selectedUser.role}
                    disabled={!canEditRole(selectedUser as { id: string; role: Role })}
                    onValueChange={(v) => setRole(selectedUser.id, v as Role)}
                  >
                    <SelectTrigger className="h-8 w-32 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
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
                            onCheckedChange={(v) => togglePerm(selectedUser.id, k.key, v === true)}
                          />
                          {k.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite by email</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="h-9 text-[13px]"
          />
          <div className="max-h-64 overflow-y-auto">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.label} className="mb-2">
                <div className="mb-1 text-[12px] font-medium text-muted-foreground">{g.label}</div>
                {g.keys.map((k) => (
                  <label key={k.key} className="flex items-center gap-2 text-[13px]">
                    <Checkbox
                      checked={invitePerms.includes(k.key)}
                      onCheckedChange={(v) =>
                        setInvitePerms((prev) =>
                          v === true ? [...prev, k.key] : prev.filter((x) => x !== k.key),
                        )
                      }
                    />
                    {k.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <Button onClick={sendInvite} disabled={!inviteEmail.trim()}>
            Create pending account
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
