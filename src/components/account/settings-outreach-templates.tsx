import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { cn } from "@/lib/utils";
import { useChannels } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Loading } from "@/components/live/kit";
import {
  OUTREACH_TEMPLATES_QUERY_KEY,
  TEMPLATE_PLACEHOLDERS,
  useOutreachTemplates,
} from "@/lib/live/outreach-templates";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const ANY = "__any";

type Draft = { name: string; channelId: string; body: string };
type ChannelOpt = { id: string; name: string };
type Template = { id: string; name: string; channel_id: string | null; body: string };

function TemplateForm({
  channels,
  initial,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
  extra,
}: {
  channels: ChannelOpt[];
  initial: Draft;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (d: Draft) => Promise<unknown>;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!draft.name.trim()) return toast.error("Give the template a name");
    setBusy(true);
    await onSubmit(draft);
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
        <Input
          value={draft.name}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Template name, for example First DM: Loom offer"
          maxLength={80}
          className="h-9 text-[13px]"
          autoFocus
        />
        <Select
          value={draft.channelId}
          disabled={disabled}
          onValueChange={(v) => setDraft({ ...draft, channelId: v })}
        >
          <SelectTrigger className="h-9 text-[13px]">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any channel</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        value={draft.body}
        disabled={disabled}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        placeholder="Hey {first_name}, ..."
        className="min-h-[120px] text-[13px]"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {extra}
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {!disabled && (
          <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function OutreachTemplatesSettings() {
  const { can } = useAuth();
  const canEdit = can("lead.leads");
  const qc = useQueryClient();
  const { data: allChannels } = useChannels();
  const { data: templatesData, isLoading } = useOutreachTemplates();
  const templates = (templatesData ?? []) as Template[];
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const channels = useMemo(() => (allChannels ?? []).filter((c) => c.is_active !== false), [allChannels]);
  const channelName = (id: string | null) =>
    id ? ((allChannels ?? []).find((c) => c.id === id)?.name ?? "Channel") : "Any channel";
  const visible = templates.filter((t) =>
    filter === "all" ? true : filter === ANY ? !t.channel_id : t.channel_id === filter,
  );
  const invalidate = () => qc.invalidateQueries({ queryKey: OUTREACH_TEMPLATES_QUERY_KEY });

  const add = async (d: Draft) => {
    const { error } = await db.from("outreach_templates").insert({
      name: d.name.trim(),
      channel_id: d.channelId === ANY ? null : d.channelId,
      body: d.body,
      order_index: templates.length,
    });
    if (error) return toast.error(error.message);
    toast.success("Template added");
    setAdding(false);
    void invalidate();
  };

  const save = async (id: string, d: Draft) => {
    const { error } = await db
      .from("outreach_templates")
      .update({ name: d.name.trim(), channel_id: d.channelId === ANY ? null : d.channelId, body: d.body })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setOpenId(null);
    void invalidate();
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Delete the template "${t.name}"? Leads that used it keep their message.`)) return;
    const { error } = await db.from("outreach_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    setOpenId(null);
    void invalidate();
  };

  if (isLoading) return <Loading />;

  const tabs = [
    { id: "all", label: "All" },
    ...channels.map((c) => ({ id: c.id, label: c.name })),
    { id: ANY, label: "Any channel" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="label-text">
        Write the messages you send, for each channel. Pick one when you add a lead in Rapid Entry, on the lead page,
        or on a follow-up. Use {TEMPLATE_PLACEHOLDERS.join(", ")} to fill in the lead's details.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex max-w-full flex-wrap gap-0.5 rounded-[10px] border border-border bg-subtle p-[3px]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={cn(
                "pressable max-w-[160px] truncate rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                filter === t.id ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {canEdit && !adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> New template
          </Button>
        )}
      </div>
      {adding && (
        <TemplateForm
          channels={channels}
          initial={{ name: "", channelId: filter === "all" ? ANY : filter, body: "" }}
          submitLabel="Add template"
          onSubmit={add}
          onCancel={() => setAdding(false)}
        />
      )}
      {visible.length === 0 && !adding ? (
        <EmptyState
          title="No templates yet"
          hint="Add the messages you send most, like your first DM, a Loom follow-up or a break-up message."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((t) => {
            const open = openId === t.id;
            return (
              <div key={t.id} className="rounded-xl border border-border/80">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : t.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{t.name}</div>
                    <div className="truncate text-[12px] text-muted-foreground">{t.body || "Empty message"}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] text-muted-foreground">
                    {channelName(t.channel_id)}
                  </span>
                  <ChevronDown
                    className={cn("size-4 shrink-0 text-faint transition-transform", open && "rotate-180")}
                  />
                </button>
                {open && (
                  <div className="border-t border-border/70 p-3">
                    <TemplateForm
                      channels={channels}
                      initial={{ name: t.name, channelId: t.channel_id ?? ANY, body: t.body }}
                      submitLabel="Save"
                      disabled={!canEdit}
                      onSubmit={(d) => save(t.id, d)}
                      onCancel={() => setOpenId(null)}
                      extra={
                        canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mr-auto text-negative"
                            onClick={() => void remove(t)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </Button>
                        )
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!canEdit && <p className="label-text">You can use these templates, but not change them.</p>}
    </div>
  );
}
