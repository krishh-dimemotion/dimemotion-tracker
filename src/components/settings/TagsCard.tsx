import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTags } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Loading, Pill } from "@/components/kit";

export function TagsCard() {
  const { data: tags, isLoading } = useTags();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ name: "", color: "#888888" });

  const { data: counts } = useQuery({
    queryKey: ["tag_usage_counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_tags").select("tag_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[row.tag_id] = (map[row.tag_id] ?? 0) + 1;
      return map;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tags"] });

  const add = async () => {
    if (!draft.name.trim()) return;
    const { error } = await supabase.from("tags").insert({ name: draft.name.trim(), color: draft.color });
    if (error) return window.alert(error.message);
    setDraft({ name: "", color: "#888888" });
    invalidate();
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("tags").update(patch as never).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this tag? It will be removed from all leads.")) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  if (isLoading) return <Loading label="Loading tags" />;

  return (
    <div className="flex flex-col gap-2">
      {(tags ?? []).length === 0 && <EmptyState title="No tags yet" hint="Add one below." />}
      {(tags ?? []).map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-2 py-2">
          <input
            type="color"
            value={t.color}
            onChange={(e) => update(t.id, { color: e.target.value })}
            className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
          />
          <Input
            defaultValue={t.name}
            className="h-8 w-48 text-[13px]"
            onBlur={(e) => e.target.value.trim() && update(t.id, { name: e.target.value.trim() })}
          />
          <Pill color={t.color}>{counts?.[t.id] ?? 0} leads</Pill>
          <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={() => remove(t.id)}>
            <Trash2 className="size-4 text-negative" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2">
        <input
          type="color"
          value={draft.color}
          onChange={(e) => setDraft((s) => ({ ...s, color: e.target.value }))}
          className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <Input
          placeholder="Tag name"
          value={draft.name}
          onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
          className="h-8 w-48 text-[13px]"
        />
        <Button size="sm" onClick={add}>
          <Plus className="size-4" /> Add tag
        </Button>
      </div>
    </div>
  );
}
