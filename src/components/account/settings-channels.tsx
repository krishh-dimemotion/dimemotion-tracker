import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ImagePlus, Plus, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { cn } from "@/lib/utils";
import { useChannels, useSenderAccounts } from "@/hooks/useLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker, EmptyState, Loading, Pill } from "@/components/live/kit";
import {
  OUTREACH_CHANNELS_QUERY_KEY,
  saveOutreachChannels,
  useOutreachChannels,
} from "@/lib/live/outreach-channels";

// Supabase tables here may be missing from the generated types.
const db = supabase as unknown as typeof supabase & { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "warming", label: "Warming up" },
  { value: "paused", label: "Paused" },
];

const ICON_MAX_SIZE = 256;
const ICON_MAX_BYTES = 512_000;

async function compressIcon(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 10_485_760) throw new Error("Image must be smaller than 10 MB.");
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = src;
    });
    const scale = Math.min(1, ICON_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process that image.");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL("image/webp", 0.82);
    if (out.length > ICON_MAX_BYTES * 1.37) out = canvas.toDataURL("image/png");
    if (out.length > ICON_MAX_BYTES * 1.37) throw new Error("That image is still too large after compression.");
    return out;
  } finally {
    URL.revokeObjectURL(src);
  }
}

const BUILTIN_ICONS: Record<string, string> = {
  mail: "/channel-icons/email.png",
  email: "/channel-icons/email.png",
  gmail: "/channel-icons/email.png",
  instagram: "/channel-icons/instagram.png",
  linkedin: "/channel-icons/linkedin.png",
};

function ChannelIcon({ value, size = "md" }: { value?: string | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8 rounded-md" : "size-9 rounded-md";
  const builtin = value ? BUILTIN_ICONS[value.toLowerCase()] : undefined;
  if (builtin) return <img src={builtin} alt="Channel icon" className={`${box} shrink-0 object-contain p-0.5`} />;
  if (value?.startsWith("data:image/") || value?.startsWith("https://") || value?.startsWith("http://"))
    return <img src={value} alt="Channel icon" className={`${box} shrink-0 border border-border object-cover`} />;
  return (
    <div
      className={`${box} flex shrink-0 items-center justify-center border border-dashed border-border text-muted-foreground`}
    >
      <ImagePlus className="size-4" />
    </div>
  );
}

function ChannelIconInput({
  value,
  onChange,
  compact = false,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressIcon(file));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not upload icon");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="flex items-center gap-2">
      <ChannelIcon value={value} size={compact ? "sm" : "md"} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload className="mr-2 size-3.5" /> {busy ? "Processing…" : value ? "Change" : "Upload icon"}
      </Button>
      {value && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="Remove icon"
          onClick={() => onChange(null)}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

type SenderAccount = {
  id: string;
  channel_id: string;
  label: string;
  identifier: string | null;
  status: string;
  daily_send_limit: number | null;
  warmup_started_at: string | null;
  warmup_ready_date: string | null;
  warmup_reminder_date: string | null;
};

export function SenderAccountsSettings() {
  const { data: channels, isLoading: loadingChannels } = useChannels();
  const { data: accounts, isLoading: loadingAccounts } = useSenderAccounts();
  const { data: outreach } = useOutreachChannels();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ name: "", kind: "other", icon: "" });

  const invalidateChannels = () => qc.invalidateQueries({ queryKey: ["channels"] });
  const invalidateAccounts = () => qc.invalidateQueries({ queryKey: ["sender_accounts"] });

  const addChannel = async () => {
    if (!draft.name.trim()) return;
    const { error } = await db
      .from("channels")
      .insert({ name: draft.name.trim(), kind: draft.kind, icon: draft.icon.trim() || null });
    if (error) return toast.error(error.message);
    setDraft({ name: "", kind: "other", icon: "" });
    invalidateChannels();
  };

  const updateChannel = async (id: string, patch: Record<string, unknown>, kind?: string) => {
    const { error } = await db.from("channels").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    if (patch.is_active !== undefined && kind && (kind === "email" || kind === "instagram" || kind === "linkedin")) {
      const on = !!patch.is_active;
      const current: string[] = outreach?.kinds ?? ["email", "instagram", "linkedin"];
      const kinds = on ? [...new Set([...current, kind])] : current.filter((k) => k !== kind);
      await saveOutreachChannels({ kinds, custom: outreach?.custom ?? [] }).catch(console.error);
      void qc.invalidateQueries({ queryKey: OUTREACH_CHANNELS_QUERY_KEY });
    }
    invalidateChannels();
  };

  const deleteChannel = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Delete channel "${name}"? Any sender accounts associated with this channel will also be permanently deleted.`,
      )
    )
      return;
    try {
      await db.from("sender_accounts").delete().eq("channel_id", id);
      const { error } = await db.from("channels").delete().eq("id", id);
      if (error) throw error;
      toast.success(`Channel "${name}" deleted`);
      invalidateChannels();
      invalidateAccounts();
      void qc.invalidateQueries({ queryKey: OUTREACH_CHANNELS_QUERY_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete channel");
    }
  };

  const addAccount = async (channelId: string) => {
    const { error } = await db
      .from("sender_accounts")
      .insert({ channel_id: channelId, label: "New account", status: "active" });
    if (error) return toast.error(error.message);
    invalidateAccounts();
  };

  const updateAccount = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("sender_accounts").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    invalidateAccounts();
  };

  const deleteAccount = async (id: string) => {
    if (!window.confirm("Delete this sender account?")) return;
    const { error } = await db.from("sender_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    invalidateAccounts();
  };

  if (loadingChannels || loadingAccounts) return <Loading label="Loading channels" />;

  const kindItems = (
    <SelectContent>
      <SelectItem value="email">Email</SelectItem>
      <SelectItem value="linkedin">LinkedIn</SelectItem>
      <SelectItem value="instagram">Instagram</SelectItem>
      <SelectItem value="other">Other</SelectItem>
    </SelectContent>
  );

  return (
    <div className="flex flex-col gap-4">
      {(channels ?? []).length === 0 && <EmptyState title="No channels yet" hint="Add a custom channel below." />}
      {(channels ?? []).map((ch) => {
        const chAccounts = ((accounts ?? []) as unknown as SenderAccount[]).filter((a) => a.channel_id === ch.id);
        return (
          <div key={ch.id} className="rounded-lg border border-border/80 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ChannelIconInput value={ch.icon} onChange={(v) => updateChannel(ch.id, { icon: v }, ch.kind)} compact />
              <Input
                defaultValue={ch.name}
                className="h-8 w-40 text-[13px]"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== ch.name &&
                  updateChannel(ch.id, { name: e.target.value.trim() }, ch.kind)
                }
              />
              <Select value={ch.kind} onValueChange={(v) => updateChannel(ch.id, { kind: v }, v)}>
                <SelectTrigger className="h-8 w-32 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                {kindItems}
              </Select>
              <div className="ml-auto flex items-center gap-2.5">
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer select-none">
                  Active
                  <Switch
                    checked={ch.is_active}
                    onCheckedChange={(v) => updateChannel(ch.id, { is_active: v }, ch.kind)}
                  />
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title={`Delete channel ${ch.name}`}
                  onClick={() => void deleteChannel(ch.id, ch.name)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {chAccounts.length === 0 && <div className="label-text">No sender accounts on this channel.</div>}
              {chAccounts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md bg-subtle px-2 py-2">
                  <Input
                    defaultValue={a.label}
                    placeholder="Label"
                    title={a.label}
                    className="h-8 w-full text-[13px] sm:w-72"
                    onBlur={(e) => e.target.value.trim() && updateAccount(a.id, { label: e.target.value.trim() })}
                  />
                  <Input
                    defaultValue={a.identifier ?? ""}
                    placeholder="Identifier"
                    className="h-8 w-full sm:w-64 text-[13px]"
                    onBlur={(e) => updateAccount(a.id, { identifier: e.target.value.trim() || null })}
                  />
                  <Select value={a.status} onValueChange={(v) => updateAccount(a.id, { status: v })}>
                    <SelectTrigger className="h-8 w-32 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    Daily limit
                    <Input
                      type="number"
                      defaultValue={a.daily_send_limit ?? ""}
                      className="h-8 w-20 text-[13px]"
                      onBlur={(e) =>
                        updateAccount(a.id, { daily_send_limit: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </label>
                  {a.status === "warming" && (
                    <>
                      <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        Started
                        <DatePicker
                          value={a.warmup_started_at?.slice(0, 10) || undefined}
                          className="w-[140px] text-[13px]"
                          onChange={(v: string | null) => updateAccount(a.id, { warmup_started_at: v || null })}
                          placeholder="Started date"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        Ready
                        <DatePicker
                          value={a.warmup_ready_date || undefined}
                          className="w-[140px] text-[13px]"
                          onChange={(v: string | null) => updateAccount(a.id, { warmup_ready_date: v || null })}
                          placeholder="Ready date"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        Reminder
                        <DatePicker
                          value={a.warmup_reminder_date || undefined}
                          className="w-[140px] text-[13px]"
                          onChange={(v: string | null) => updateAccount(a.id, { warmup_reminder_date: v || null })}
                          placeholder="Reminder date"
                        />
                      </label>
                    </>
                  )}
                  <Pill tone={a.status === "active" ? "positive" : a.status === "warming" ? "warning" : "neutral"}>
                    {a.status}
                  </Pill>
                  <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={() => deleteAccount(a.id)}>
                    <Trash2 className="size-4 text-negative" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => addAccount(ch.id)}>
                <Plus className="size-4" /> Add sender account
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Channel name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="h-8 w-40 text-[13px]"
          />
          <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v }))}>
            <SelectTrigger className="h-8 w-32 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            {kindItems}
          </Select>
          <Button size="sm" onClick={addChannel}>
            <Plus className="size-4" /> Add channel
          </Button>
        </div>
        <ChannelIconInput value={draft.icon || null} onChange={(v) => setDraft((d) => ({ ...d, icon: v || "" }))} />
      </div>
    </div>
  );
}

const SIDEBAR_CHANNELS = [
  { kind: "email", label: "Email", icon: "/channel-icons/email.png" },
  { kind: "instagram", label: "Instagram", icon: "/channel-icons/instagram.png" },
  { kind: "linkedin", label: "LinkedIn", icon: "/channel-icons/linkedin.png" },
];

export function OutreachChannelsPicker() {
  const { workspace } = useAuth();
  const canEdit = workspace?.role === "owner" || workspace?.role === "admin";
  const qc = useQueryClient();
  const { data: outreach } = useOutreachChannels();
  const [saving, setSaving] = useState(false);
  const kinds: string[] = outreach?.kinds ?? ["email", "instagram", "linkedin"];

  const toggle = async (kind: string) => {
    if (!canEdit || saving) return;
    const enable = !kinds.includes(kind);
    const next = enable ? [...kinds, kind] : kinds.filter((k) => k !== kind);
    setSaving(true);
    try {
      await saveOutreachChannels({ kinds: next, custom: outreach?.custom ?? [] });
      await db.from("channels").update({ is_active: enable }).eq("kind", kind);
      await qc.invalidateQueries({ queryKey: OUTREACH_CHANNELS_QUERY_KEY });
      await qc.invalidateQueries({ queryKey: ["channels"] });
      const name = kind.replace(/^./, (c) => c.toUpperCase());
      toast.success(enable ? `${name} enabled in sidebar` : `${name} hidden from sidebar`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pro-card mb-4 p-5">
      <div className="text-[13px] font-semibold tracking-tight">Lead section & outreach channels</div>
      <p className="label-text mt-0.5">
        Choose which channels appear in your sidebar under Leads and drive your default metrics. We primarily offer
        Email, Instagram, and LinkedIn for lead outreach. Additional channels configured below can be used for sender
        accounts and custom logs, but will not appear in the Leads sidebar menu.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SIDEBAR_CHANNELS.map((c) => {
          const on = kinds.includes(c.kind);
          return (
            <button
              key={c.kind}
              type="button"
              aria-pressed={on}
              disabled={!canEdit || saving}
              onClick={() => void toggle(c.kind)}
              className={cn(
                "pressable inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed",
                on ? "border-foreground bg-subtle" : "border-border hover:bg-subtle",
              )}
            >
              <img src={c.icon} alt="" className="size-4 object-contain" />
              {c.label}
              {on && <Check className="size-3.5" />}
            </button>
          );
        })}
      </div>
      {!canEdit && <p className="label-text mt-2">Only workspace admins can change this.</p>}
    </div>
  );
}
