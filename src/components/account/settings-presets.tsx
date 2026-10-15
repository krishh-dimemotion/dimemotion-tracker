import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Loading, Pill } from "@/components/live/kit";
import { PERMISSION_GROUPS, type PermissionPreset } from "@/components/account/settings-permissions";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

type Draft = { id: string | null; name: string; keys: string[] };

export function PresetsSettings() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["permission_presets"],
    queryFn: async () => {
      const { data, error } = await db.from("permission_presets").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as PermissionPreset[];
    },
  });
  const reload = () => qc.invalidateQueries({ queryKey: ["permission_presets"] });

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    if (draft.id) {
      const { error } = await db
        .from("permission_presets")
        .update({ name: draft.name.trim(), permission_keys: draft.keys })
        .eq("id", draft.id);
      if (error) return window.alert(error.message);
    } else {
      const { error } = await db
        .from("permission_presets")
        .insert({ name: draft.name.trim(), permission_keys: draft.keys, is_builtin: false });
      if (error) return window.alert(error.message);
    }
    setDraft(null);
    void reload();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this preset?")) return;
    const { error } = await db.from("permission_presets").delete().eq("id", id);
    if (error) return window.alert(error.message);
    void reload();
  };

  if (isLoading) return <Loading label="Loading presets" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDraft({ id: null, name: "", keys: [] })}>
          <Plus className="size-4" /> New preset
        </Button>
      </div>
      {(data ?? []).length === 0 && <EmptyState title="No presets yet" hint="Create one above." />}
      <div className="flex flex-col gap-2">
        {(data ?? []).map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-subtle px-3 py-2"
          >
            <div className="min-w-[140px] text-[13px]">{p.name}</div>
            {p.is_builtin && <Pill tone="info">Built-in</Pill>}
            <span className="label-text">{p.permission_keys.length} permissions</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setDraft({ id: null, name: `${p.name} copy`, keys: [...p.permission_keys] })}
                title="Duplicate"
              >
                <Copy className="size-4" />
              </Button>
              {!p.is_builtin && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDraft({ id: p.id, name: p.name, keys: [...p.permission_keys] })}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => void remove(p.id)}>
                    <Trash2 className="size-4 text-negative" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit preset" : "New preset"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Input
                  placeholder="Preset name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
                  className="h-9 text-[13px]"
                />
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="mb-1 text-[12px] font-medium text-muted-foreground">{g.label}</div>
                    <div className="flex flex-col gap-1">
                      {g.keys.map((k) => (
                        <label key={k.key} className="flex items-center gap-2 text-[13px]">
                          <Checkbox
                            checked={draft.keys.includes(k.key)}
                            onCheckedChange={(c) =>
                              setDraft(
                                (d) =>
                                  d && {
                                    ...d,
                                    keys: c === true ? [...d.keys, k.key] : d.keys.filter((x) => x !== k.key),
                                  },
                              )
                            }
                          />
                          {k.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <Button onClick={save} disabled={!draft.name.trim()}>
                  Save preset
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
