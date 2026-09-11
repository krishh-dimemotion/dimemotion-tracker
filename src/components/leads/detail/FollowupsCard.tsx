import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CollapsibleCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toDateInput } from "@/lib/format";
import type { LeadFollowup, Channel } from "@/components/leads/types";

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
  onChange,
  onAdd,
}: {
  followups: LeadFollowup[];
  channels: Channel[];
  canEdit: boolean;
  onChange: (id: string, patch: Record<string, unknown>) => void;
  onAdd: () => void;
}) {
  const sorted = [...followups].sort((a, b) => a.sequence_number - b.sequence_number);
  return (
    <CollapsibleCard id="lead.followups" title="Follow-ups">
      <div className="flex flex-col gap-2">
        {sorted.map((fu) => (
          <FollowupRow key={fu.id} fu={fu} channels={channels} canEdit={canEdit} onChange={(p) => onChange(fu.id, p)} />
        ))}
        {canEdit && (
          <Button variant="outline" size="sm" className="w-fit" onClick={onAdd}>
            <Plus className="mr-1 size-3.5" /> Add follow-up
          </Button>
        )}
      </div>
    </CollapsibleCard>
  );
}
