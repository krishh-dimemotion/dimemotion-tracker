import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChannels, useOutreachTargets, useProfiles } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Loading } from "@/components/kit";

export function TargetsCard() {
  const { data: channels, isLoading: loadingChannels } = useChannels();
  const { data: targets, isLoading: loadingTargets } = useOutreachTargets();
  const { data: profiles } = useProfiles();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ user_id: "", channel_id: "", daily_target: 10 });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["outreach_targets"] });

  const globalTargets = (targets ?? []).filter((t) => !t.user_id);
  const overrideTargets = (targets ?? []).filter((t) => t.user_id);

  const upsertGlobal = async (channel_id: string, daily_target: number) => {
    const existing = globalTargets.find((t) => t.channel_id === channel_id);
    const { error } = existing
      ? await supabase.from("outreach_targets").update({ daily_target }).eq("id", existing.id)
      : await supabase.from("outreach_targets").insert({ channel_id, daily_target, user_id: null });
    if (error) return window.alert(error.message);
    invalidate();
  };

  const addOverride = async () => {
    if (!draft.user_id || !draft.channel_id) return;
    const { error } = await supabase.from("outreach_targets").insert({
      channel_id: draft.channel_id,
      user_id: draft.user_id,
      daily_target: draft.daily_target,
    });
    if (error) return window.alert(error.message);
    setDraft({ user_id: "", channel_id: "", daily_target: 10 });
    invalidate();
  };

  const updateOverride = async (id: string, daily_target: number) => {
    const { error } = await supabase.from("outreach_targets").update({ daily_target }).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const removeOverride = async (id: string) => {
    const { error } = await supabase.from("outreach_targets").delete().eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  if (loadingChannels || loadingTargets) return <Loading label="Loading targets" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 text-[12px] font-medium text-muted-foreground">Daily target per channel</div>
        <div className="flex flex-col gap-2">
          {(channels ?? []).length === 0 && <EmptyState title="No channels yet" />}
          {(channels ?? []).map((c) => {
            const t = globalTargets.find((x) => x.channel_id === c.id);
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-md bg-subtle px-2 py-2">
                <span className="w-40 text-[13px]">{c.name}</span>
                <Input
                  type="number"
                  min={0}
                  defaultValue={t?.daily_target ?? 0}
                  className="h-8 w-24 text-[13px]"
                  onBlur={(e) => upsertGlobal(c.id, Number(e.target.value) || 0)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[12px] font-medium text-muted-foreground">Per-user overrides</div>
        <div className="flex flex-col gap-2">
          {overrideTargets.length === 0 && <EmptyState title="No overrides" hint="Add one below." />}
          {overrideTargets.map((t) => {
            const user = (profiles ?? []).find((p) => p.id === t.user_id);
            const channel = (channels ?? []).find((c) => c.id === t.channel_id);
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-2 py-2">
                <span className="w-40 text-[13px]">{user?.full_name || user?.email || "Unknown user"}</span>
                <span className="w-32 text-[13px] text-muted-foreground">{channel?.name ?? "?"}</span>
                <Input
                  type="number"
                  min={0}
                  defaultValue={t.daily_target}
                  className="h-8 w-24 text-[13px]"
                  onBlur={(e) => updateOverride(t.id, Number(e.target.value) || 0)}
                />
                <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={() => removeOverride(t.id)}>
                  <Trash2 className="size-4 text-negative" />
                </Button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2">
            <Select value={draft.user_id} onValueChange={(v) => setDraft((s) => ({ ...s, user_id: v }))}>
              <SelectTrigger className="h-8 w-40 text-[13px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                {(profiles ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={draft.channel_id} onValueChange={(v) => setDraft((s) => ({ ...s, channel_id: v }))}>
              <SelectTrigger className="h-8 w-32 text-[13px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                {(channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              value={draft.daily_target}
              onChange={(e) => setDraft((s) => ({ ...s, daily_target: Number(e.target.value) || 0 }))}
              className="h-8 w-24 text-[13px]"
            />
            <Button size="sm" onClick={addOverride}>
              <Plus className="size-4" /> Add override
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
