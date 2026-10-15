import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Loading } from "@/components/live/kit";
import {
  useFollowupTemplates,
  type FollowupStep,
  type FollowupTemplate,
} from "@/components/account/settings-data";

const CHANNEL_KINDS = ["email", "linkedin", "instagram", "other"];
const SAVE_DELAY_MS = 700;
const db = supabase as any;

function TemplateEditor({
  template,
  onRename,
  onMakeDefault,
  onRemove,
  onSaveSteps,
}: {
  template: FollowupTemplate;
  onRename: (name: string) => void;
  onMakeDefault: () => void;
  onRemove: () => void;
  onSaveSteps: (steps: FollowupStep[]) => void;
}) {
  const [steps, setSteps] = useState(template.steps);
  const pending = useRef<FollowupStep[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSaveSteps);
  saveRef.current = onSaveSteps;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) saveRef.current(next);
  }, []);

  const serverSteps = JSON.stringify(template.steps);
  useEffect(() => {
    if (!pending.current) setSteps(template.steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSteps]);
  useEffect(() => flush, [flush]);

  const commit = (next: FollowupStep[], now = false) => {
    setSteps(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (now) flush();
    else timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };
  const patch = (i: number, p: Partial<FollowupStep>, now = false) =>
    commit(
      steps.map((s, idx) => (idx === i ? { ...s, ...p } : s)),
      now,
    );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/80 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          defaultValue={template.name}
          className="h-8 w-56 text-[13px]"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== template.name) onRename(v);
          }}
        />
        <button
          type="button"
          onClick={onMakeDefault}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]",
            template.is_default ? "border-info text-info bg-subtle" : "border-border text-muted-foreground",
          )}
        >
          <Star className="size-3.5" fill={template.is_default ? "currentColor" : "none"} />
          {template.is_default ? "Default" : "Make default"}
        </button>
        <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={onRemove}>
          <Trash2 className="size-4 text-negative" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Each number is days after the previous follow-up. The first counts from when the outreach was sent.
      </p>
      <div className="flex flex-col gap-1.5">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-2 py-1.5">
            <span
              className="label-text w-16"
              title="Days after the previous follow-up. The first step counts from the outreach date."
            >
              + days
            </span>
            <Input
              type="number"
              min={0}
              className="h-8 w-20 text-[13px]"
              value={Number.isFinite(step.offset_days) ? step.offset_days : 0}
              onChange={(e) => patch(i, { offset_days: Math.max(0, Number(e.target.value) || 0) })}
              onBlur={flush}
            />
            <span className="label-text w-16">Channel</span>
            <Select value={step.channel_kind || "email"} onValueChange={(v) => patch(i, { channel_kind: v }, true)}>
              <SelectTrigger className="h-8 w-32 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(CHANNEL_KINDS.includes(step.channel_kind) || !step.channel_kind
                  ? CHANNEL_KINDS
                  : [...CHANNEL_KINDS, step.channel_kind]
                ).map((k) => (
                  <SelectItem key={k} value={k}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8 flex-1 min-w-[140px] text-[13px]"
              value={step.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              onBlur={flush}
              placeholder="Step label"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() =>
                commit(
                  steps.filter((_, idx) => idx !== i),
                  true,
                )
              }
            >
              <Trash2 className="size-4 text-negative" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            const last = steps[steps.length - 1];
            const offset = last ? Math.max(1, last.offset_days || 1) : 1;
            commit([...steps, { offset_days: offset, channel_kind: last?.channel_kind || "email", label: "" }], true);
          }}
        >
          <Plus className="mr-1 size-3.5" /> Add step
        </Button>
      </div>
    </div>
  );
}

export function FollowupTemplatesSettings() {
  const { data, isLoading } = useFollowupTemplates();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["followup_templates"] });

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await db.from("followup_templates").insert({ name: name.trim(), steps: [] });
    if (error) return toast.error(error.message);
    setName("");
    void refresh();
  };
  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("followup_templates").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    void refresh();
  };
  const saveSteps = async (id: string, steps: FollowupStep[]) => {
    qc.setQueryData<FollowupTemplate[]>(["followup_templates"], (old) =>
      (old ?? []).map((t) => (t.id === id ? { ...t, steps } : t)),
    );
    const { error } = await db.from("followup_templates").update({ steps }).eq("id", id);
    if (error) {
      toast.error(`Could not save the template: ${error.message}`);
      void refresh();
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this follow-up template?")) return;
    const { error } = await db.from("followup_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void refresh();
  };
  const makeDefault = async (id: string) => {
    const others = (data ?? []).filter((t) => t.id !== id && t.is_default);
    for (const t of others) await db.from("followup_templates").update({ is_default: false }).eq("id", t.id);
    await update(id, { is_default: true });
  };

  if (isLoading) return <Loading label="Loading follow-up templates" />;

  return (
    <div className="flex flex-col gap-3">
      {(data ?? []).length === 0 && <EmptyState title="No templates yet" hint="Add one below." />}
      {(data ?? []).map((t) => (
        <TemplateEditor
          key={t.id}
          template={t}
          onRename={(n) => void update(t.id, { name: n })}
          onMakeDefault={() => void makeDefault(t.id)}
          onRemove={() => void remove(t.id)}
          onSaveSteps={(steps) => saveSteps(t.id, steps)}
        />
      ))}
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-2">
        <Input
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          className="h-8 w-56 text-[13px]"
        />
        <Button size="sm" onClick={() => void add()}>
          <Plus className="size-4" /> Add template
        </Button>
      </div>
    </div>
  );
}
