import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChannels, useSenderAccounts } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Loading, Pill } from "@/components/kit";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "warming", label: "Warming up" },
  { value: "paused", label: "Paused" },
];

export function AccountsCard() {
  const { data: channels, isLoading: loadingChannels } = useChannels();
  const { data: accounts, isLoading: loadingAccounts } = useSenderAccounts();
  const qc = useQueryClient();
  const [newChannel, setNewChannel] = useState({ name: "", kind: "other", icon: "" });

  const invalidateChannels = () => qc.invalidateQueries({ queryKey: ["channels"] });
  const invalidateAccounts = () => qc.invalidateQueries({ queryKey: ["sender_accounts"] });

  const addChannel = async () => {
    if (!newChannel.name.trim()) return;
    const { error } = await supabase.from("channels").insert({
      name: newChannel.name.trim(),
      kind: newChannel.kind as "email" | "linkedin" | "instagram" | "other",
      icon: newChannel.icon.trim() || null,
    });
    if (error) return window.alert(error.message);
    setNewChannel({ name: "", kind: "other", icon: "" });
    invalidateChannels();
  };

  const updateChannel = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("channels").update(patch as never).eq("id", id);
    if (error) return window.alert(error.message);
    invalidateChannels();
  };

  const addAccount = async (channel_id: string) => {
    const { error } = await supabase.from("sender_accounts").insert({
      channel_id,
      label: "New account",
      status: "active",
    });
    if (error) return window.alert(error.message);
    invalidateAccounts();
  };

  const updateAccount = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("sender_accounts").update(patch as never).eq("id", id);
    if (error) return window.alert(error.message);
    invalidateAccounts();
  };

  const deleteAccount = async (id: string) => {
    if (!window.confirm("Delete this sender account?")) return;
    const { error } = await supabase.from("sender_accounts").delete().eq("id", id);
    if (error) return window.alert(error.message);
    invalidateAccounts();
  };

  if (loadingChannels || loadingAccounts) return <Loading label="Loading channels" />;

  return (
    <div className="flex flex-col gap-4">
      {(channels ?? []).length === 0 && <EmptyState title="No channels yet" hint="Add a custom channel below." />}
      {(channels ?? []).map((c) => {
        const accts = (accounts ?? []).filter((a) => a.channel_id === c.id);
        return (
          <div key={c.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                defaultValue={c.name}
                className="h-8 w-40 text-[13px]"
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && updateChannel(c.id, { name: e.target.value.trim() })}
              />
              <Select value={c.kind} onValueChange={(v) => updateChannel(c.id, { kind: v })}>
                <SelectTrigger className="h-8 w-32 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input
                defaultValue={c.icon ?? ""}
                placeholder="icon name"
                className="h-8 w-28 text-[13px]"
                onBlur={(e) => updateChannel(c.id, { icon: e.target.value.trim() || null })}
              />
              <label className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
                Active
                <Switch checked={c.is_active} onCheckedChange={(v) => updateChannel(c.id, { is_active: v })} />
              </label>
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {accts.length === 0 && <div className="label-text">No sender accounts on this channel.</div>}
              {accts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-2 py-2">
                  <Input
                    defaultValue={a.label}
                    placeholder="Label"
                    className="h-8 w-32 text-[13px]"
                    onBlur={(e) => e.target.value.trim() && updateAccount(a.id, { label: e.target.value.trim() })}
                  />
                  <Input
                    defaultValue={a.identifier ?? ""}
                    placeholder="Identifier"
                    className="h-8 w-40 text-[13px]"
                    onBlur={(e) => updateAccount(a.id, { identifier: e.target.value.trim() || null })}
                  />
                  <Select value={a.status} onValueChange={(v) => updateAccount(a.id, { status: v })}>
                    <SelectTrigger className="h-8 w-32 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    Daily limit
                    <Input
                      type="number"
                      defaultValue={a.daily_send_limit ?? ""}
                      className="h-8 w-20 text-[13px]"
                      onBlur={(e) => updateAccount(a.id, { daily_send_limit: e.target.value ? Number(e.target.value) : null })}
                    />
                  </label>
                  {a.status === "warming" && (
                    <>
                      <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        Started
                        <Input
                          type="date"
                          defaultValue={a.warmup_started_at?.slice(0, 10) ?? ""}
                          className="h-8 w-[140px] text-[13px]"
                          onBlur={(e) => updateAccount(a.id, { warmup_started_at: e.target.value || null })}
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        Ready
                        <Input
                          type="date"
                          defaultValue={a.warmup_ready_date ?? ""}
                          className="h-8 w-[140px] text-[13px]"
                          onBlur={(e) => updateAccount(a.id, { warmup_ready_date: e.target.value || null })}
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        Reminder
                        <Input
                          type="date"
                          defaultValue={a.warmup_reminder_date ?? ""}
                          className="h-8 w-[140px] text-[13px]"
                          onBlur={(e) => updateAccount(a.id, { warmup_reminder_date: e.target.value || null })}
                        />
                      </label>
                    </>
                  )}
                  <Pill tone={a.status === "active" ? "positive" : a.status === "warming" ? "warning" : "neutral"}>
                    {a.status}
                  </Pill>
                  <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={() => deleteAccount(a.id)}>
                    <Trash2 className="size-4 text-negative" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => addAccount(c.id)}>
                <Plus className="size-4" /> Add sender account
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-3">
        <Input
          placeholder="Channel name"
          value={newChannel.name}
          onChange={(e) => setNewChannel((s) => ({ ...s, name: e.target.value }))}
          className="h-8 w-40 text-[13px]"
        />
        <Select value={newChannel.kind} onValueChange={(v) => setNewChannel((s) => ({ ...s, kind: v }))}>
          <SelectTrigger className="h-8 w-32 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="icon name"
          value={newChannel.icon}
          onChange={(e) => setNewChannel((s) => ({ ...s, icon: e.target.value }))}
          className="h-8 w-28 text-[13px]"
        />
        <Button size="sm" onClick={addChannel}>
          <Plus className="size-4" /> Add channel
        </Button>
      </div>
    </div>
  );
}
