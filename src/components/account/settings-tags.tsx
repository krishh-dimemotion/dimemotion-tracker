import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Funnel, Plus, Search, Square, SquareCheckBig, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTags } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Loading, Pill } from "@/components/live/kit";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function TagsSettings() {
  const { data: tags, isLoading } = useTags();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ name: "", color: "#888888" });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: usage } = useQuery({
    queryKey: ["tag_usage_counts"],
    queryFn: async () => {
      const { data, error } = await db.from("lead_tags").select("tag_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { tag_id: string }[]) counts[row.tag_id] = (counts[row.tag_id] ?? 0) + 1;
      return counts;
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tags"] });
    void qc.invalidateQueries({ queryKey: ["tag_usage_counts"] });
  };

  const filtered = useMemo(() => {
    const all = tags ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const allSelected = filtered.length > 0 && filtered.every((t) => selected.includes(t.id));

  const toggleAll = () => {
    if (allSelected) {
      const ids = new Set(filtered.map((t) => t.id));
      setSelected((s) => s.filter((id) => !ids.has(id)));
    } else {
      setSelected(Array.from(new Set([...selected, ...filtered.map((t) => t.id)])));
    }
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const add = async () => {
    if (!draft.name.trim()) return;
    const { error } = await db.from("tags").insert({ name: draft.name.trim(), color: draft.color });
    if (error) return toast.error(error.message);
    setDraft({ name: "", color: "#888888" });
    invalidate();
    toast.success("Tag created");
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("tags").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this tag? It will be removed from all leads.")) return;
    const { error } = await db.from("tags").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setSelected((s) => s.filter((x) => x !== id));
    invalidate();
    toast.success("Tag deleted");
  };

  const removeSelected = async () => {
    if (selected.length === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selected.length} tag${selected.length === 1 ? "" : "s"}? They will be removed from all leads.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await db.from("tags").delete().in("id", selected);
      if (error) throw error;
      toast.success(`Deleted ${selected.length} tags`);
      setSelected([]);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete tags");
    } finally {
      setBusy(false);
    }
  };

  const removeUnused = async () => {
    const unused = (tags ?? []).filter((t) => (usage?.[t.id] ?? 0) === 0);
    if (unused.length === 0) return toast.info("No unused tags found. All tags are linked to at least 1 lead.");
    if (!window.confirm(`Delete all ${unused.length} unused tag${unused.length === 1 ? "" : "s"} (tags with 0 leads)?`))
      return;
    setBusy(true);
    try {
      const ids = unused.map((t) => t.id);
      const { error } = await db.from("tags").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Deleted ${unused.length} unused tags`);
      setSelected((s) => s.filter((x) => !ids.includes(x)));
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete unused tags");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Loading label="Loading tags" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tags by keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-[12.5px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {filtered.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={toggleAll}>
              {allSelected ? <SquareCheckBig className="mr-1.5 size-3.5" /> : <Square className="mr-1.5 size-3.5" />}
              {allSelected ? "Deselect all" : `Select all (${filtered.length})`}
            </Button>
          )}
          {selected.length > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              className="h-8 text-[12px]"
              onClick={() => void removeSelected()}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Delete selected ({selected.length})
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            className="h-8 text-[12px]"
            onClick={() => void removeUnused()}
            title="Clean up tags with 0 leads"
          >
            <Funnel className="mr-1.5 size-3.5" />
            Delete unused tags
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2">
        <input
          type="color"
          value={draft.color}
          onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
          className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <Input
          placeholder="New tag name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          className="h-8 w-48 text-[13px]"
        />
        <Button size="sm" onClick={() => void add()} className="h-8">
          <Plus className="size-4" /> Add tag
        </Button>
      </div>
      {(tags ?? []).length === 0 && <EmptyState title="No tags yet" hint="Add one above." />}
      {filtered.length === 0 && (tags ?? []).length > 0 && (
        <div className="py-4 text-center text-[13px] text-muted-foreground">No tags matching “{search}”</div>
      )}
      <div className="flex flex-col gap-1.5 max-h-[460px] overflow-y-auto pr-1">
        {filtered.map((t) => {
          const on = selected.includes(t.id);
          return (
            <div
              key={t.id}
              className={`flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
                on ? "border-primary/50 bg-primary/5" : "border-border/60 bg-subtle/50 hover:bg-subtle"
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="text-muted-foreground hover:text-foreground"
                title={on ? "Deselect" : "Select"}
              >
                {on ? <SquareCheckBig className="size-4 text-primary" /> : <Square className="size-4" />}
              </button>
              <input
                type="color"
                value={t.color}
                onChange={(e) => update(t.id, { color: e.target.value })}
                className="size-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
              <Input
                defaultValue={t.name}
                className="h-7 w-56 text-[12.5px]"
                onBlur={(e) =>
                  e.target.value.trim() && e.target.value.trim() !== t.name && update(t.id, { name: e.target.value.trim() })
                }
              />
              <Pill color={t.color}>{usage?.[t.id] ?? 0} leads</Pill>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-7 text-muted-foreground hover:text-negative"
                onClick={() => void remove(t.id)}
                title="Delete tag"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
