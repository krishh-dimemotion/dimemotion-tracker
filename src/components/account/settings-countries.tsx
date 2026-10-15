import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCountries } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Loading } from "@/components/live/kit";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function CountriesSettings() {
  const { data: countries, isLoading } = useCountries(false);
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ name: "", code: "", flag_emoji: "" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["countries"] });

  const add = async () => {
    if (!draft.name.trim()) return;
    const { error } = await db.from("countries").insert({
      name: draft.name.trim(),
      code: draft.code.trim().toUpperCase() || null,
      flag_emoji: draft.flag_emoji.trim() || null,
    });
    if (error) return window.alert(error.message);
    setDraft({ name: "", code: "", flag_emoji: "" });
    void invalidate();
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("countries").update(patch).eq("id", id);
    if (error) return window.alert(error.message);
    void invalidate();
  };

  if (isLoading) return <Loading label="Loading countries" />;

  return (
    <div className="flex flex-col gap-2">
      {(countries ?? []).length === 0 && <EmptyState title="No countries yet" hint="Add one below." />}
      {(countries ?? []).map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-2 py-2">
          <Input
            defaultValue={c.flag_emoji ?? ""}
            className="h-8 w-14 text-center text-[15px]"
            onBlur={(e) => update(c.id, { flag_emoji: e.target.value.trim() || null })}
          />
          <Input
            defaultValue={c.name}
            className="h-8 w-48 text-[13px]"
            onBlur={(e) => e.target.value.trim() && update(c.id, { name: e.target.value.trim() })}
          />
          <Input
            defaultValue={c.code ?? ""}
            placeholder="ISO"
            className="h-8 w-16 text-[13px] uppercase"
            onBlur={(e) => update(c.id, { code: e.target.value.trim().toUpperCase() || null })}
          />
          <label className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
            Active
            <Switch checked={c.is_active} onCheckedChange={(v) => update(c.id, { is_active: v })} />
          </label>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2">
        <Input
          placeholder="Flag"
          value={draft.flag_emoji}
          onChange={(e) => setDraft((d) => ({ ...d, flag_emoji: e.target.value }))}
          className="h-8 w-14 text-center text-[15px]"
        />
        <Input
          placeholder="Country name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="h-8 w-48 text-[13px]"
        />
        <Input
          placeholder="ISO"
          value={draft.code}
          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
          className="h-8 w-16 text-[13px] uppercase"
        />
        <Button size="sm" onClick={add}>
          <Plus className="size-4" /> Add country
        </Button>
      </div>
    </div>
  );
}
