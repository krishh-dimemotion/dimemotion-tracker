import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toast } from "sonner";
import { Boxes, Database, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// TODO: server-only. Live handler deletes every lead (+ contacts, links, follow-ups, tasks,
// lead tags, activity, CRM deals) for the workspace and clears lead rows in the Google Sheet.
export const resetLeadData = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(
  async (): Promise<{ deletedLeads: number; sheet: { ok: boolean; message: string } }> => {
    throw new Error("TODO: resetLeadData server function not ported");
  },
);

export function DataSettings() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = useServerFn(resetLeadData);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href="/lt/data">
          <Database className="size-4" /> Import / Export
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href="/lt/archive">
          <Boxes className="size-4" /> Archive
        </a>
      </Button>
      {isAdmin && (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setConfirm("");
          }}
        >
          <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
            <RotateCcw className="size-4" /> Reset Data
          </Button>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete all lead data?</DialogTitle>
              <DialogDescription>
                This permanently deletes every lead, along with its contacts, links, follow-ups, tasks, tags on leads,
                activity history and CRM deals. It also clears the lead rows in your connected Google Sheet. Your
                settings are kept: stages, channels, sender accounts, countries, tags, follow-up templates, targets,
                presets and users. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <span className="label-text">Type RESET to confirm</span>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || confirm.trim() !== "RESET"}
                onClick={async () => {
                  if (confirm.trim() !== "RESET") {
                    toast.error("Type RESET exactly to confirm.");
                    return;
                  }
                  setBusy(true);
                  try {
                    const res = await reset({});
                    qc.clear();
                    toast.success(`Deleted ${res.deletedLeads} lead(s). Your settings were kept.`);
                    if (res.sheet.ok) toast.success(res.sheet.message);
                    else toast.error(`Leads were deleted, but the Google Sheet was not cleared: ${res.sheet.message}`);
                    setOpen(false);
                    setTimeout(() => window.location.reload(), 1500);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not reset lead data.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Resetting…" : "Reset data"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export type FollowupStep = { offset_days: number; channel_kind: string; label: string };
export type FollowupTemplate = { id: string; name: string; is_default: boolean; steps: FollowupStep[] };

export function useFollowupTemplates() {
  return useQuery({
    queryKey: ["followup_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("followup_templates").select("*").order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map((t) => ({
        ...t,
        steps: Array.isArray(t.steps) ? t.steps : [],
      })) as FollowupTemplate[];
    },
  });
}
