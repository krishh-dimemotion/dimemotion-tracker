import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { DEFAULT_SHORTCUTS } from "@/lib/shortcuts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loading } from "@/components/kit";

function bindingFromEvent(e: KeyboardEvent) {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  const key = e.key;
  if (!["Control", "Meta", "Shift", "Alt"].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }
  return parts.join("+");
}

export function ShortcutsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [capturing, setCapturing] = useState<string | null>(null);

  const { data: overrides, isLoading } = useQuery({
    queryKey: ["shortcuts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("shortcuts").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;
      const binding = bindingFromEvent(e);
      void save(capturing, binding);
      setCapturing(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const save = async (action_key: string, binding: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("shortcuts")
      .upsert({ user_id: user.id, action_key, binding }, { onConflict: "user_id,action_key" });
    if (error) return window.alert(error.message);
    qc.invalidateQueries({ queryKey: ["shortcuts", user.id] });
  };

  const resetAll = async () => {
    if (!user) return;
    if (!window.confirm("Reset all shortcuts to defaults?")) return;
    const { error } = await supabase.from("shortcuts").delete().eq("user_id", user.id);
    if (error) return window.alert(error.message);
    qc.invalidateQueries({ queryKey: ["shortcuts", user.id] });
  };

  if (isLoading) return <Loading label="Loading shortcuts" />;

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Binding</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {DEFAULT_SHORTCUTS.map((s) => {
            const override = overrides?.find((o) => o.action_key === s.key);
            const binding = override?.binding ?? s.binding;
            return (
              <TableRow key={s.key}>
                <TableCell className="text-[13px]">{s.label}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setCapturing(s.key)}
                    className="rounded-md border border-border bg-subtle px-2 py-1 font-mono text-[12px]"
                  >
                    {capturing === s.key ? "Press keys..." : binding}
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Button variant="outline" size="sm" className="w-fit" onClick={resetAll}>
        Reset to defaults
      </Button>
    </div>
  );
}
