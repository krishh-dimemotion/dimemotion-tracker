import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Loading } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type Step = { offset_days: number; channel_kind: string; label: string };
type Template = {
  id: string;
  name: string;
  is_default: boolean;
  steps: Step[];
};

function useFollowupTemplates() {
  return useQuery({
    queryKey: ["followup_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("followup_templates").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, steps: Array.isArray(t.steps) ? t.steps : [] })) as unknown as Template[];
    },
  });
}

export function FollowupTemplatesCard() {
  const { data: templates, isLoading } = useFollowupTemplates();
  const qc = useQueryClient();
  const [draftName, setDraftName] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["followup_templates"] });

  const add = async () => {
    if (!draftName.trim()) return;
    const { error } = await supabase.from("followup_templates").insert({ name: draftName.trim(), steps: [] });
    if (error) return window.alert(error.message);
    setDraftName("");
    invalidate();
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("followup_templates").update(patch as never).eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this follow-up template?")) return;
    const { error } = await supabase.from("followup_templates").delete().eq("id", id);
    if (error) return window.alert(error.message);
    invalidate();
  };

  const makeDefault = async (id: string) => {
    const others = (templates ?? []).filter((t) => t.id !== id && t.is_default);
    for (const o of others) {
      await supabase.from("followup_templates").update({ is_default: false }).eq("id", o.id);
    }
    await update(id, { is_default: true });
  };

  const setSteps = (t: Template, steps: Step[]) => update(t.id, { steps: steps as unknown as never });

  const addStep = (t: Template) => setSteps(t, [...t.steps, { offset_days: 0, channel_kind: "email", label: "" }]);
  const removeStep = (t: Template, idx: number) => setSteps(t, t.steps.filter((_, i) => i !== idx));
  const updateStep = (t: Template, idx: number, patch: Partial<Step>) =>
    setSteps(
      t,
      t.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );

  if (isLoading) return <Loading label="Loading follow-up templates" />;

  return (
    <div className="flex flex-col gap-3">
      {(templates ?? []).length === 0 && <EmptyState title="No templates yet" hint="Add one below." />}
      {(templates ?? []).map((t) => (
        <div key={t.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              defaultValue={t.name}
              className="h-8 w-56 text-[13px]"
              onBlur={(e) => e.target.value.trim() && update(t.id, { name: e.target.value.trim() })}
            />
            <button
              type="button"
              onClick={() => makeDefault(t.id)}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]",
                t.is_default ? "border-info text-info bg-subtle" : "border-border text-muted-foreground",
              )}
            >
              <Star className="size-3.5" fill={t.is_default ? "currentColor" : "none"} />
              {t.is_default ? "Default" : "Make default"}
            </button>
            <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={() => remove(t.id)}>
              <Trash2 className="size-4 text-negative" />
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            {t.steps.map((s, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-2 py-1.5">
                <span className="label-text w-16">Day</span>
                <Input
                  type="number"
                  className="h-8 w-20 text-[13px]"
                  value={s.offset_days}
                  onChange={(e) => updateStep(t, idx, { offset_days: Number(e.target.value) || 0 })}
                />
                <span className="label-text w-16">Channel</span>
                <Input
                  className="h-8 w-32 text-[13px]"
                  value={s.channel_kind}
                  onChange={(e) => updateStep(t, idx, { channel_kind: e.target.value })}
                  placeholder="email"
                />
                <Input
                  className="h-8 flex-1 min-w-[140px] text-[13px]"
                  value={s.label}
                  onChange={(e) => updateStep(t, idx, { label: e.target.value })}
                  placeholder="Step label"
                />
                <Button variant="ghost" size="icon" className="size-8" onClick={() => removeStep(t, idx)}>
                  <Trash2 className="size-4 text-negative" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => addStep(t)}>
              <Plus className="mr-1 size-3.5" /> Add step
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-2">
        <Input
          placeholder="Template name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          className="h-8 w-56 text-[13px]"
        />
        <Button size="sm" onClick={add}>
          <Plus className="size-4" /> Add template
        </Button>
      </div>
    </div>
  );
}
