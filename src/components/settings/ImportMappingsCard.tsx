import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";

type MappingRow = { id: string; name: string; signature: string; mapping: Record<string, string> };

export function ImportMappingsCard() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["import_mappings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("import_mappings").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MappingRow[];
    },
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("import_mappings").update({ name } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import_mappings"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("import_mappings").delete().eq("id", id);
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
          const mappedCount = Object.values(m.mapping ?? {}).filter((v) => v && v !== "ignore").length;
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <Input
                className="h-8 w-[240px] text-[13px]"
                value={drafts[m.id] ?? m.name}
                onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                onBlur={() => {
                  const next = (drafts[m.id] ?? m.name).trim();
                  if (next && next !== m.name) rename.mutate({ id: m.id, name: next });
                }}
              />
              <span className="label-text">{mappedCount} columns mapped</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-7"
                onClick={() => remove.mutate(m.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
}
