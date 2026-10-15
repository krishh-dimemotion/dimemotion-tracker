import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loading } from "@/components/live/kit";

// Live default list (app-shell chunk). Repo lib/shortcuts.ts lacks "go.invoices".
const SHORTCUT_ACTIONS = [
  { key: "help", label: "Open shortcuts help", binding: "?" },
  { key: "palette", label: "Command palette", binding: "Mod+K" },
  { key: "go.dashboard", label: "Go to Dashboard", binding: "G D" },
  { key: "go.leads", label: "Go to Leads", binding: "G L" },
  { key: "go.outreach", label: "Go to Outreach Tracker", binding: "G O" },
  { key: "go.crm", label: "Go to CRM Records", binding: "G C" },
  { key: "go.pipeline", label: "Go to Pipeline", binding: "G P" },
  { key: "go.revenue", label: "Go to Revenue", binding: "G R" },
  { key: "go.invoices", label: "Go to Invoices", binding: "G I" },
  { key: "go.settings", label: "Go to Settings", binding: "G S" },
  { key: "lead.new", label: "New lead", binding: "N" },
  { key: "focus.search", label: "Focus search", binding: "/" },
  { key: "filters", label: "Open filters", binding: "F" },
  { key: "view.cycle", label: "Cycle view mode", binding: "V" },
  { key: "lead.next", label: "Next lead", binding: "J" },
  { key: "lead.prev", label: "Previous lead", binding: "K" },
  { key: "lead.edit", label: "Edit focused lead", binding: "E" },
  { key: "lead.archive", label: "Archive focused lead", binding: "A" },
  { key: "lead.push", label: "Push focused lead to CRM", binding: "P" },
  { key: "lead.followup", label: "Set follow-up date", binding: "S" },
  { key: "lead.stage", label: "Set stage to nth stage", binding: "1..9" },
  { key: "save", label: "Force save", binding: "Mod+S" },
  { key: "escape", label: "Close dialog, clear selection", binding: "Esc" },
];

const MODIFIERS = ["Control", "Meta", "Shift", "Alt"];

function bindingFromEvent(e: KeyboardEvent) {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  const k = e.key;
  if (!MODIFIERS.includes(k)) parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join("+");
}

type ShortcutRow = { action_key: string; binding: string };

export function ShortcutsSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [capturing, setCapturing] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["shortcuts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("shortcuts").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as ShortcutRow[];
    },
  });

  const save = async (actionKey: string, binding: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("shortcuts")
      .upsert({ user_id: user.id, action_key: actionKey, binding } as never, { onConflict: "user_id,action_key" });
    if (error) return window.alert(error.message);
    void qc.invalidateQueries({ queryKey: ["shortcuts", user.id] });
  };

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      if (MODIFIERS.includes(e.key)) return;
      void save(capturing, bindingFromEvent(e));
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

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
          {SHORTCUT_ACTIONS.map((a) => {
            const binding = data?.find((r) => r.action_key === a.key)?.binding ?? a.binding;
            return (
              <TableRow key={a.key}>
                <TableCell className="text-[13px]">{a.label}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setCapturing(a.key)}
                    className="rounded-md border border-border bg-subtle px-2 py-1 font-mono text-[12px]"
                  >
                    {capturing === a.key ? "Press keys..." : binding}
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={async () => {
          if (!user || !window.confirm("Reset all shortcuts to defaults?")) return;
          const { error } = await supabase.from("shortcuts").delete().eq("user_id", user.id);
          if (error) return window.alert(error.message);
          void qc.invalidateQueries({ queryKey: ["shortcuts", user.id] });
        }}
      >
        Reset to defaults
      </Button>
    </div>
  );
}
