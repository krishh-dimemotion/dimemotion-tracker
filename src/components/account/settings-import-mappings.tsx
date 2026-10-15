import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/live/kit";

type ImportMapping = { id: string; name: string; mapping: Record<string, string> | null; created_at: string };
const db = supabase as any;

export function ImportMappingsSettings() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ["import_mappings"],
    queryFn: async () => {
      const { data, error } = await db.from("import_mappings").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImportMapping[];
    },
  });
  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await db.from("import_mappings").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import_mappings"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("import_mappings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import_mappings"] }),
  });
  const rows = list.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <p className="label-text">
        Saved column mappings are applied automatically when a file with the same columns is uploaded.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No saved mappings yet" />
      ) : (
        rows.map((m) => {
          const mapped = Object.values(m.mapping ?? {}).filter((v) => v && v !== "ignore").length;
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 p-2">
              <Input
                className="h-8 w-[240px] text-[13px]"
                value={drafts[m.id] ?? m.name}
                onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                onBlur={() => {
                  const v = (drafts[m.id] ?? m.name).trim();
                  if (v && v !== m.name) rename.mutate({ id: m.id, name: v });
                }}
              />
              <span className="label-text">{mapped} columns mapped</span>
              <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={() => remove.mutate(m.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
}
