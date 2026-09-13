import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { CollapsibleCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toDateInput } from "@/lib/format";
import type { LeadFollowup, Channel } from "@/components/leads/types";

type TemplateStep = { offset_days: number; channel_kind?: string; label?: string };
type FollowupTemplate = {
  id: string;
  name: string;
  is_default: boolean;
  steps: TemplateStep[];
};

function FollowupRow({
  fu,
  channels,
  canEdit,
  onChange,
}: {
  fu: LeadFollowup;
  channels: Channel[];
  canEdit: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const [notes, setNotes] = useState(fu.notes ?? "");
  useEffect(() => setNotes(fu.notes ?? ""), [fu.id]);

  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-md border border-border p-2 sm:grid-cols-6">
      <div className="text-[12px] text-muted-foreground">#{fu.sequence_number}</div>
      <Input
        type="date"
        className="h-8 text-[13px]"
        disabled={!canEdit}
        defaultValue={toDateInput(fu.scheduled_date)}
        onBlur={(e) => {
          const v = e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null;
          if (v !== fu.scheduled_date) onChange({ scheduled_date: v });
        }}
      />
      <Select
        {...(fu.channel_id ? { value: fu.channel_id } : {})}
        disabled={!canEdit}
        onValueChange={(v) => onChange({ channel_id: v })}
      >
        <SelectTrigger className="h-8 text-[13px]">
          <SelectValue placeholder="Channel" />
        </SelectTrigger>
        <SelectContent>
          {channels.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox
          checked={fu.status === "sent"}
          disabled={!canEdit}
          onCheckedChange={(v) => {
            const sent = v === true;
            onChange({ status: sent ? "sent" : "pending", sent_at: sent ? new Date().toISOString() : null });
          }}
        />
        Sent
      </label>
      <Input
        type="date"
        className="h-8 text-[13px]"
        disabled={!canEdit || fu.status !== "sent"}
        value={toDateInput(fu.sent_at)}
        onChange={(e) => {
          const v = e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null;
          onChange({ sent_at: v });
        }}
      />
      <Textarea
        placeholder="Notes"
        className="h-8 min-h-8 text-[13px]"
        disabled={!canEdit}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== (fu.notes ?? "") && onChange({ notes: notes || null })}
      />
    </div>
  );
}

export function FollowupsCard({
  followups,
  channels,
  canEdit,
  leadId,
  lastContactedAt,
  onChange,
  onAdd,
  invalidate,
}: {
  followups: LeadFollowup[];
  channels: Channel[];
  canEdit: boolean;
  leadId: string;
  lastContactedAt?: string | null;
  onChange: (id: string, patch: Record<string, unknown>) => void;
  onAdd: () => void;
  invalidate: () => void;
}) {
  const sorted = [...followups].sort((a, b) => a.sequence_number - b.sequence_number);

  const templatesQuery = useQuery({
    queryKey: ["followup_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("followup_templates").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as FollowupTemplate[];
    },
  });

  const channelByKind = (kind?: string) => {
    if (!kind) return null;
    const lower = kind.toLowerCase();
    return channels.find((c) => c.name.toLowerCase().includes(lower))?.id ?? null;
  };

  const applyTemplate = async (template: FollowupTemplate) => {
    const steps = Array.isArray(template.steps) ? (template.steps as TemplateStep[]) : [];
    if (steps.length === 0) {
      toast.error("This template has no steps");
      return;
    }
    const baseDate = lastContactedAt ? new Date(lastContactedAt) : new Date();
    let nextSeq = followups.length > 0 ? Math.max(...followups.map((f) => f.sequence_number)) + 1 : 1;

    const rows = steps.map((step) => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + (step.offset_days ?? 0));
      const row = {
        lead_id: leadId,
        sequence_number: nextSeq,
        scheduled_date: d.toISOString(),
        status: "pending",
        channel_id: channelByKind(step.channel_kind),
        notes: step.label ?? null,
      };
      nextSeq += 1;
      return row;
    });

    const { error } = await supabase.from("lead_followups").insert(rows as never);
    if (error) toast.error(error.message);
    else {
      toast.success(`Applied "${template.name}"`);
      invalidate();
    }
  };

  return (
    <CollapsibleCard id="lead.followups" title="Follow-ups">
      <div className="flex flex-col gap-2">
        {sorted.map((fu) => (
          <FollowupRow key={fu.id} fu={fu} channels={channels} canEdit={canEdit} onChange={(p) => onChange(fu.id, p)} />
        ))}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="w-fit" onClick={onAdd}>
              <Plus className="mr-1 size-3.5" /> Add follow-up
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-fit" disabled={!templatesQuery.data?.length}>
                  Apply template <ChevronDown className="ml-1 size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(templatesQuery.data ?? []).map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => applyTemplate(t)}>
                    {t.name}
                    {t.is_default ? " (default)" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
