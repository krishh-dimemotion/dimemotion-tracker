import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Loading, Pill } from "@/components/kit";

export function PresetsCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; name: string; keys: string[] } | null>(null);

  const { data: presets, isLoading } = useQuery({
    queryKey: ["permission_presets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permission_presets").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["permission_presets"] });

  const openNew = () => setEditing({ id: null, name: "", keys: [] });
  const openEdit = (p: { id: string; name: string; permission_keys: string[] }) =>
    setEditing({ id: p.id, name: p.name, keys: [...p.permission_keys] });
  const openDuplicate = (p: { name: string; permission_keys: string[] }) =>
    setEditing({ id: null, name: `${p.name} copy`, keys: [...p.permission_keys] });

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    if (editing.id) {
      const { error } = await supabase
        .from("permission_presets")
        .update({ name: editing.name.trim(), permission_keys: editing.keys })
        .eq("id", editing.id);
      if (error) return window.alert(error.message);
    } else {
      const { error } = await supabase
        .from("permission_presets")
        .insert({ name: editing.name.trim(), permission_keys: editing.keys, is_builtin: false });
      if (error) return window.alert(error.message);
    }
    setEditing(null);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this preset?")) return;
    const { error } = await supabase.from("permission_presets").delete().eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  if (isLoading) return <Loading label="Loading presets" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" /> New preset
        </Button>
      </div>

      {(presets ?? []).length === 0 && <EmptyState title="No presets yet" hint="Create one above." />}

      <div className="flex flex-col gap-2">
        {(presets ?? []).map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-subtle px-3 py-2"
          >
            <div className="min-w-[140px] text-[13px]">{p.name}</div>
            {p.is_builtin && <Pill tone="info">Built-in</Pill>}
            <span className="label-text">{p.permission_keys.length} permissions</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-8" onClick={() => openDuplicate(p)} title="Duplicate">
                <Copy className="size-4" />
              </Button>
              {!p.is_builtin && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => remove(p.id)}>
                    <Trash2 className="size-4 text-negative" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.id ? "Edit preset" : "New preset"}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Input
                  placeholder="Preset name"
                  value={editing.name}
                  onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
                  className="h-9 text-[13px]"
                />
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="mb-1 text-[12px] font-medium text-muted-foreground">{g.label}</div>
                    <div className="flex flex-col gap-1">
                      {g.keys.map((k) => (
                        <label key={k.key} className="flex items-center gap-2 text-[13px]">
                          <Checkbox
                            checked={editing.keys.includes(k.key)}
                            onCheckedChange={(v) =>
                              setEditing((s) =>
                                s
                                  ? {
                                      ...s,
                                      keys:
                                        v === true
                                          ? [...s.keys, k.key]
                                          : s.keys.filter((x) => x !== k.key),
                                    }
                                  : s,
                              )
                            }
                          />
                          {k.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <Button onClick={save} disabled={!editing.name.trim()}>
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
