// Ported from live chunk TodayLeadStream-DhspyDDE.js
// Exports: LeadQuickAdd (live `n`), TodayLeadStream (live `t`).
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Tag,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useChannels, useSenderAccounts, useStages, useTags } from "@/hooks/useLookups";
import { cn } from "@/lib/utils";
// Shared (ported in parallel by another agent)
import { Card, EmptyState, Loading, DatePicker, todayISO } from "@/components/live/kit";
import { addDaysISO, fmtDate } from "@/lib/format";
import {
  addDaysLocalISO,
  autoStageForOutreach,
  companyDomainFromEmail,
  pickChannelForKind,
  defaultLeadStage,
  isValidEmail,
  normalizeEmail,
  parseInstagramInput,
  parseLinkedInInput,
  parseWebsiteInput,
  useRapidEntryConfig,
} from "@/lib/live/config";
import { findDuplicateLead, DUPLICATE_MATCH_LABELS } from "@/lib/live/duplicate-detector";
import { TemplateSelect } from "@/components/live/template-select";
import { useOutreachTemplates, templatesForChannel, fillTemplate } from "@/lib/live/outreach-templates";
import type { RateRange } from "./outreach-rates";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type LeadKind = "email" | "linkedin" | "instagram";

const TAG_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

// TODO: live calls the server fn syncLeadToSheet (sheets.functions) after each change.
async function syncLeadToSheet(_leadId: string): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  return { ok: true, skipped: true };
}

// TODO: live opens a side panel via app-shell useLeadPanel().openLead; repo has no panel.
function useOpenLead() {
  return (id: string) => window.open(`/lt/leads/${id}`, "_blank", "noopener");
}

function TagPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: tags } = useTags();
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const canManage = can("settings.tags");
  const all = (tags ?? []) as any[];
  const chosen = useMemo(() => {
    const m = new Map(all.map((t) => [t.id, t]));
    return selected.map((id) => m.get(id)).filter(Boolean) as any[];
  }, [all, selected]);
  const filtered = useMemo(() => {
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((t) => t.name.toLowerCase().includes(q));
  }, [all, search]);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (name.length > 50) return toast.error("Tag name is too long (maximum 50 characters).");
    const existing = all.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selected.includes(existing.id)) onChange([...selected, existing.id]);
      setNewName("");
      return;
    }
    const color = TAG_COLORS[all.length % TAG_COLORS.length];
    const { data, error } = await supabase.from("tags").insert({ name, color } as never).select("id").single();
    if (error || !data) return toast.error(error?.message ?? "Could not create the tag.");
    setNewName("");
    onChange([...selected, (data as any).id]);
    qc.invalidateQueries({ queryKey: ["tags"] });
  };
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete the tag "${name}"? It will be removed from all leads.`)) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChange(selected.filter((x) => x !== id));
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["rapid-today"] });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chosen.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-subtle px-2.5 py-0.5 text-[12px] font-medium text-foreground transition-colors"
        >
          <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
          <span className="max-w-[200px] truncate">{t.name}</span>
          <button type="button" onClick={() => toggle(t.id)} className="text-muted-foreground hover:text-foreground ml-0.5" title="Remove tag">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-[12px] text-muted-foreground hover:border-foreground/40 hover:bg-subtle hover:text-foreground"
          >
            <Tag className="size-3" />
            <span>{chosen.length === 0 ? "Add tags" : "Add more"}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2" sideOffset={4}>
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-[12px]"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 divide-y divide-border/30">
              {filtered.length === 0 && (
                <div className="py-3 text-center text-[12px] text-muted-foreground">
                  {search.trim() ? "No matching tags" : "No tags created yet"}
                </div>
              )}
              {filtered.map((t) => {
                const on = selected.includes(t.id);
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-subtle/80 cursor-pointer text-[12.5px]"
                    onClick={() => toggle(t.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="truncate">{t.name}</span>
                    </div>
                    {on && <Check className="size-3.5 text-primary shrink-0" />}
                    {managing && canManage && (
                      <X
                        className="size-3.5 text-negative hover:scale-110 ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          void remove(t.id, t.name);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {canManage && (
              <div className="pt-2 border-t border-border flex flex-col gap-1.5">
                <div className="flex items-center gap-1">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        void create();
                      }
                    }}
                    placeholder="Create new tag"
                    className="h-7 text-[12px]"
                  />
                  <Button type="button" size="sm" className="h-7 px-2" onClick={() => void create()} disabled={!newName.trim()}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                {all.length > 0 && (
                  <div className="flex justify-between items-center pt-1 text-[11px] text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setManaging((m) => !m)}
                      className="hover:underline flex items-center gap-1 text-muted-foreground"
                    >
                      <Settings2 className="size-3" />
                      {managing ? "Done managing" : "Manage / delete tags"}
                    </button>
                    <span className="text-[10.5px]">{all.length} total</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const PRIMARY: Record<LeadKind, { primary: string; placeholder: string }> = {
  instagram: { primary: "Instagram URL", placeholder: "https://instagram.com/username or @username" },
  linkedin: { primary: "LinkedIn Profile URL", placeholder: "https://www.linkedin.com/in/name" },
  email: { primary: "Contact Email", placeholder: "name@company.com" },
};

type Flags = { sent: boolean; connection: boolean; replied: boolean };

function defaultFlags(kind: LeadKind, cfg: any): Flags {
  if (kind === "instagram")
    return {
      sent: cfg.instagram.showOutreachSent && cfg.instagram.defaultOutreachSent,
      connection: false,
      replied: cfg.instagram.showReplied && cfg.instagram.defaultReplied,
    };
  if (kind === "linkedin")
    return {
      sent: cfg.linkedin.showMessageSent && cfg.linkedin.defaultMessageSent,
      connection: cfg.linkedin.showConnectionSent && cfg.linkedin.defaultConnectionSent,
      replied: cfg.linkedin.showReplied && cfg.linkedin.defaultReplied,
    };
  return {
    sent: cfg.email.showEmailSent && cfg.email.defaultEmailSent,
    connection: false,
    replied: cfg.email.showReplied && cfg.email.defaultReplied,
  };
}

function YesNoToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors",
        value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
      )}
    >
      {label}
      <span className="text-[11px] opacity-80">{value ? "Yes" : "No"}</span>
    </button>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
        active ? "border-foreground bg-subtle text-foreground" : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function useFollowupTemplates() {
  return useQuery({
    queryKey: ["followup_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("followup_templates" as never).select("*").order("name");
      if (error) throw error;
      return ((data ?? []) as any[]).map((t) => ({ ...t, steps: Array.isArray(t.steps) ? t.steps : [] }));
    },
  });
}

export function LeadQuickAdd({ kind }: { kind: LeadKind }) {
  const { user, can } = useAuth() as any;
  const qc = useQueryClient();
  const { data: channels, isLoading: channelsLoading } = useChannels();
  const { data: senders } = useSenderAccounts();
  const { data: cfg, isLoading: cfgLoading } = useRapidEntryConfig();
  const { data: stages } = useStages("lead");
  const channel = useMemo(() => pickChannelForKind(channels, kind), [channels, kind]);
  const senderOptions = useMemo(() => {
    const all = (senders ?? []) as any[];
    const mine = channel ? all.filter((s) => s.channel_id === channel.id) : [];
    return mine.length ? mine : all;
  }, [senders, channel]);

  const primaryRef = useRef<HTMLInputElement>(null);
  const [primary, setPrimary] = useState("");
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [senderId, setSenderId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [template, setTemplate] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [flags, setFlags] = useState<Flags>({ sent: false, connection: false, replied: false });
  const [followup, setFollowup] = useState<string>("none");
  const [customDate, setCustomDate] = useState("");
  const [followupTplId, setFollowupTplId] = useState("");
  const { data: followupTemplates } = useFollowupTemplates();
  const followupTpl = (followupTemplates ?? []).find((t) => t.id === followupTplId) ?? null;
  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState<any>(null);
  const [addAnyway, setAddAnyway] = useState(false);
  const checkSeq = useRef(0);
  const lastChecked = useRef<string | null>(null);

  const identity = () =>
    kind === "instagram" ? { instagram: primary } : kind === "linkedin" ? { linkedin: primary } : { email: primary, website: company };

  useEffect(() => {
    const id = identity();
    const has = Object.values(id).some((v) => (v ?? "").trim());
    const seq = ++checkSeq.current;
    if (!has) {
      setDupe(null);
      return;
    }
    const t = setTimeout(() => {
      findDuplicateLead(id).then((d: any) => {
        if (seq === checkSeq.current) {
          lastChecked.current = JSON.stringify(id);
          setDupe(d);
          setAddAnyway(false);
        }
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, company, kind]);

  const openInTab = (id: string) => window.open(`/lt/leads/${id}`, "_blank", "noopener");

  const reset = (c?: any) => {
    lastChecked.current = null;
    setDupe(null);
    setAddAnyway(false);
    setPrimary("");
    setContactName("");
    setCompany("");
    if (c) {
      setFlags(defaultFlags(kind, c));
      setFollowup(c[kind].showFollowup && !followupTplId ? c[kind].defaultFollowup : "none");
    }
    setCustomDate("");
    requestAnimationFrame(() => primaryRef.current?.focus());
  };

  useEffect(() => {
    if (cfg) reset(cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, kind]);

  const autofill = (value: string) => {
    if (kind === "instagram") {
      const p = parseInstagramInput(value);
      if (p?.handle && !contactName.trim()) setContactName(p.handle);
    } else if (kind === "linkedin") {
      const p = parseLinkedInInput(value);
      if (p?.personName && !contactName.trim()) setContactName(p.personName);
      if (p?.companyName && !company.trim()) setCompany(p.companyName);
    } else if (kind === "email") {
      const d = isValidEmail(value) ? companyDomainFromEmail(value) : "";
      if (d && !company.trim()) setCompany(d);
    }
  };

  if (channelsLoading || cfgLoading || !cfg)
    return (
      <Card>
        <Loading label="Loading" />
      </Card>
    );

  const showFollowup = cfg[kind].showFollowup;
  const canEdit = can("lead.leads");
  const pickFollowup = (v: string) => {
    setFollowup(v);
    setFollowupTplId("");
  };
  const followupDate = () =>
    !showFollowup || followup === "none" ? null : followup === "custom" ? customDate || null : addDaysLocalISO(Number(followup));
  const resolvedName = () =>
    contactName.trim()
      ? contactName.trim()
      : kind === "instagram"
        ? (parseInstagramInput(primary)?.handle ?? "")
        : kind === "linkedin"
          ? (parseLinkedInInput(primary)?.personName ?? "")
          : "";
  const message = () =>
    template
      ? fillTemplate(template.body, {
          name: resolvedName(),
          company: company.trim() || (kind === "email" && isValidEmail(primary) ? companyDomainFromEmail(primary) : ""),
        })
      : "";
  const copyMessage = async () => {
    const m = message();
    if (!m.trim()) return;
    try {
      await navigator.clipboard.writeText(m);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };
  const applyFollowupTemplate = async (leadId: string, tpl: any) => {
    const steps = Array.isArray(tpl.steps) ? tpl.steps : [];
    let offset = 0;
    const rows = steps.map((s: any, i: number) => {
      offset += Math.max(0, Number(s.offset_days) || 0);
      const ck = s.channel_kind?.toLowerCase();
      const ch = ck ? ((channels ?? []) as any[]).find((c) => c.name.toLowerCase().includes(ck)) : null;
      return {
        lead_id: leadId,
        sequence_number: i + 1,
        scheduled_date: addDaysLocalISO(offset),
        status: "pending",
        channel_id: ch?.id ?? null,
        notes: s.label?.trim() || null,
      };
    });
    if (!rows.length) return null;
    const { error } = await supabase.from("lead_followups").insert(rows as never);
    return error?.message ?? null;
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    if (!channel) return toast.error(`No ${kind} channel found. Add one in Settings > Channels and sender accounts.`);
    const alreadyChecked = !dupe && lastChecked.current === JSON.stringify(identity());
    if (!addAnyway && !alreadyChecked) {
      const d: any = await findDuplicateLead(identity());
      if (d) {
        setDupe(d);
        return toast.error(`${d.companyName} (${d.leadCode}) is already in your tracker.`);
      }
    }
    const now = new Date().toISOString();
    const lead: Record<string, any> = { channel_id: channel.id, date_added: addDaysLocalISO(0), created_by: user?.id ?? null };
    const first = defaultLeadStage(stages);
    if (first) lead.stage_id = first.id;
    const contact: Record<string, any> = { order_index: 0, is_primary: true };
    let display = "";
    if (kind === "instagram") {
      const p = parseInstagramInput(primary);
      if (!p) return toast.error("Paste an Instagram profile URL or @username.");
      const name = contactName.trim() || p.handle || p.url;
      display = p.handle || name;
      Object.assign(lead, { company_name: name, primary_contact: p.handle || name, instagram_url: p.url });
      Object.assign(contact, {
        person_name: contactName.trim() && contactName.trim() !== p.handle ? contactName.trim() : null,
        instagram_url: p.url,
      });
      if (flags.sent) Object.assign(lead, { instagram_sent: true, instagram_sent_at: now });
      if (flags.replied) Object.assign(lead, { instagram_replied: true, instagram_replied_at: now });
    } else if (kind === "linkedin") {
      const p = parseLinkedInInput(primary);
      if (!p) return toast.error("Paste a LinkedIn profile URL.");
      const person = contactName.trim() || p.personName;
      const comp = company.trim() || p.companyName;
      display = person || comp || p.url;
      Object.assign(lead, { company_name: comp || person || p.url, primary_contact: person || null });
      if (/\/company\//.test(p.url)) Object.assign(lead, { company_linkedin_url: p.url });
      else Object.assign(contact, { linkedin_url: p.url });
      Object.assign(contact, { person_name: person || null });
      if (flags.connection) Object.assign(lead, { linkedin_connection_sent: true, linkedin_connection_sent_at: now });
      if (flags.sent) Object.assign(lead, { linkedin_sent: true, linkedin_sent_at: now });
      if (flags.replied) Object.assign(lead, { linkedin_replied: true, linkedin_replied_at: now });
    } else {
      const email = normalizeEmail(primary) ?? primary.trim();
      if (!isValidEmail(email)) return toast.error("Enter a valid email address.");
      const site = parseWebsiteInput(company);
      const host = site ? site.host : company.trim();
      display = contactName.trim() || email;
      Object.assign(lead, { company_name: host || contactName.trim() || email, primary_contact: email });
      if (site) Object.assign(lead, { website_url: site.url });
      Object.assign(contact, { person_name: contactName.trim() || null, email });
      if (flags.sent) Object.assign(lead, { email_sent: true, email_sent_at: now });
      if (flags.replied) Object.assign(lead, { email_replied: true, email_replied_at: now });
    }
    if (flags.sent || flags.connection) Object.assign(lead, { contacted_channel_id: channel.id, last_contacted_at: now });
    if (flags.replied) Object.assign(lead, { reply_channel_id: channel.id });
    if (cfg[kind].showSenderAccount && senderId) Object.assign(lead, { sender_account_id: senderId });
    const fu = followupDate();
    if (fu) Object.assign(lead, { next_followup_date: fu });
    if (template) Object.assign(lead, { outreach_template_id: template.id, personalized_message: message() || null });
    const advanced = autoStageForOutreach(stages, lead.stage_id, lead);
    if (advanced) lead.stage_id = advanced.id;
    setSaving(true);
    const tags = cfg[kind].showTags ? tagIds : [];
    const { data, error } = await supabase.rpc("create_lead" as never, { _lead: lead, _contacts: [contact], _tag_ids: tags } as never);
    if (error || !data) {
      setSaving(false);
      return toast.error(error?.message ?? "Could not add the lead.");
    }
    const leadId = data as unknown as string;
    if (showFollowup && followupTpl) {
      const err = await applyFollowupTemplate(leadId, followupTpl);
      if (err) toast.error(`Lead added, but the follow-up template was not applied: ${err}`);
    }
    setSaving(false);
    toast.success(`Lead ${display} added`);
    syncLeadToSheet(leadId)
      .then((r) => {
        if (!r.ok && !r.skipped) console.error("Google Sheet sync failed:", r.reason);
      })
      .catch((err) => console.error("Google Sheet sync failed:", err));
    qc.invalidateQueries({ queryKey: ["rapid-today", kind] });
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    qc.invalidateQueries({ queryKey: ["leads-board"] });
    reset(cfg);
  };

  const toggles: { key: keyof Flags; label: string; show: boolean }[] =
    kind === "instagram"
      ? [
          { key: "sent", label: "Outreach Sent", show: cfg.instagram.showOutreachSent },
          { key: "replied", label: "Outreach Seen / Replied", show: cfg.instagram.showReplied },
        ]
      : kind === "linkedin"
        ? [
            { key: "connection", label: "Connection Request Sent", show: cfg.linkedin.showConnectionSent },
            { key: "sent", label: "Message Sent", show: cfg.linkedin.showMessageSent },
            { key: "replied", label: "Replied", show: cfg.linkedin.showReplied },
          ]
        : [
            { key: "sent", label: "Email Sent", show: cfg.email.showEmailSent },
            { key: "replied", label: "Email Replied", show: cfg.email.showReplied },
          ];

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!channel && (
          <div className="rounded-md border border-dashed border-border p-2 text-[12px] text-muted-foreground">
            No {kind} channel exists yet. Add one in Settings under Channels and sender accounts.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">{PRIMARY[kind].primary} *</span>
            <Input
              ref={primaryRef}
              autoFocus
              type={kind === "email" ? "email" : "text"}
              value={primary}
              placeholder={PRIMARY[kind].placeholder}
              onChange={(e) => setPrimary(e.target.value)}
              onBlur={(e) => autofill(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                setTimeout(() => autofill(text), 0);
              }}
              className="h-9 text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">{kind === "instagram" ? "Username / Contact Name" : "Contact Name"}</span>
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={kind === "instagram" ? "Filled from the URL if blank" : "Optional"}
              className="h-9 text-[13px]"
            />
          </label>
          {kind !== "instagram" && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-muted-foreground">{kind === "email" ? "Company Website / Name" : "Company Name"}</span>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" className="h-9 text-[13px]" />
            </label>
          )}
        </div>
        {cfg[kind].showSenderAccount && (
          <label className="flex max-w-xs flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">{kind === "email" ? "Sender Account" : "Sent From Account"}</span>
            <Select value={senderId || "__none"} onValueChange={(v) => setSenderId(v === "__none" ? "" : v)}>
              <SelectTrigger className="h-9 text-[13px]">
                <SelectValue placeholder="Choose account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {senderOptions.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        {cfg[kind].showTags && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">Tags</span>
            <TagPicker selected={tagIds} onChange={setTagIds} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {toggles
            .filter((t) => t.show)
            .map((t) => (
              <YesNoToggle key={t.key} label={t.label} value={flags[t.key]} onChange={(v) => setFlags((f) => ({ ...f, [t.key]: v }))} />
            ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Outreach Template</span>
            <TemplateSelect
              channelId={channel?.id ?? null}
              value={template?.id ?? null}
              onChange={setTemplate}
              className="w-full max-w-[260px]"
              placeholder="Pick the message you sent"
              showManageLink
            />
          </div>
          {template && (
            <div className="flex items-start gap-2 rounded-lg border border-border/80 bg-subtle/40 p-2.5">
              <p className="min-w-0 flex-1 text-[12.5px] whitespace-pre-wrap text-muted-foreground">{message() || "This template is empty."}</p>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void copyMessage()}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>
        {showFollowup && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Next Follow-up</span>
            <Chip label="None" active={followup === "none"} onClick={() => setFollowup("none")} />
            <Chip label="+2 Days" active={followup === "2"} onClick={() => pickFollowup("2")} />
            <Chip label="+3 Days" active={followup === "3"} onClick={() => pickFollowup("3")} />
            <Chip label="+7 Days" active={followup === "7"} onClick={() => pickFollowup("7")} />
            <Chip label="Custom Date" active={followup === "custom"} onClick={() => pickFollowup("custom")} />
            {followup === "custom" && (
              <DatePicker
                value={customDate || undefined}
                minDate={todayISO()}
                placeholder="Pick date"
                onChange={(v: string | null) => setCustomDate(v || "")}
                className="w-40 text-[12px]"
              />
            )}
          </div>
        )}
        {showFollowup && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Follow-up Template</span>
            {(followupTemplates ?? []).length ? (
              <Select
                value={followupTplId || "__none"}
                onValueChange={(v) => {
                  setFollowupTplId(v === "__none" ? "" : v);
                  if (v !== "__none") setFollowup("none");
                }}
              >
                <SelectTrigger className="h-8 w-full max-w-[260px] text-[12px]">
                  <SelectValue placeholder="Select a follow-up template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select a follow-up template</SelectItem>
                  {(followupTemplates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.steps?.length ?? 0} {t.steps?.length === 1 ? "step" : "steps"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-[12px] text-muted-foreground">No follow-up templates yet. Add one in Settings.</span>
            )}
          </div>
        )}
        {dupe && !addAnyway && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning px-3 py-2 text-[12px] text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span className="flex-1">
              Lead already exists: <span className="font-medium">{dupe.companyName}</span> ({dupe.leadCode})
              <span className="text-muted-foreground">
                {" "}
                · {(DUPLICATE_MATCH_LABELS as Record<string, string>)[dupe.matchedOn]}
                {dupe.archived ? " · archived" : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => openInTab(dupe.leadId)}
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
            >
              Open Lead in New Tab <ExternalLink className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setAddAnyway(true)}
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Add anyway
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{dupe && addAnyway ? "Will be added as a second copy" : "Press Enter to add"}</span>
          {dupe && !addAnyway ? (
            <Button type="button" size="sm" variant="outline" onClick={() => openInTab(dupe.leadId)}>
              <ExternalLink className="size-4" /> View Existing
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={saving || !canEdit || !channel}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add Lead
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

const OUTREACH_FIELDS: Record<LeadKind, { field: string; on: string; off: string }[]> = {
  instagram: [
    { field: "instagram_sent", on: "Sent", off: "Not sent" },
    { field: "instagram_replied", on: "Replied", off: "No reply" },
  ],
  linkedin: [
    { field: "linkedin_connection_sent", on: "Request sent", off: "No request" },
    { field: "linkedin_sent", on: "Message sent", off: "No message" },
    { field: "linkedin_replied", on: "Replied", off: "No reply" },
  ],
  email: [
    { field: "email_sent", on: "Sent", off: "Not sent" },
    { field: "email_replied", on: "Replied", off: "No reply" },
  ],
};

function profileLink(kind: LeadKind, lead: any): string | null {
  const c = lead.lead_contacts.find((x: any) => x.is_primary) ?? lead.lead_contacts[0];
  if (kind === "instagram") return lead.instagram_url ?? c?.instagram_url ?? null;
  if (kind === "linkedin") return c?.linkedin_url ?? lead.company_linkedin_url ?? null;
  const email = c?.email ?? lead.primary_contact;
  return email ? `mailto:${email}` : null;
}

export function TodayLeadStream({ kind, range }: { kind: LeadKind; range?: RateRange }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const openLead = useOpenLead();
  const { data: channels } = useChannels();
  const channel = useMemo(() => pickChannelForKind(channels, kind), [channels, kind]);
  const today = addDaysLocalISO(0);
  const canEdit = can("lead.leads");
  const from = range?.from ?? today;
  const to = range?.to ?? today;

  const { data: rows, isLoading } = useQuery({
    queryKey: ["rapid-today", kind, channel?.id, from, to],
    enabled: !!channel?.id,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(
          "id, lead_code, stage_id, company_name, primary_contact, instagram_url, company_linkedin_url, instagram_sent, instagram_replied, linkedin_connection_sent, linkedin_sent, linkedin_replied, email_sent, email_replied, next_followup_date, lead_contacts(email, linkedin_url, instagram_url, is_primary), lead_tags(tag_id), sender_accounts(label)",
        )
        .eq("channel_id", channel!.id);
      q = range ? q.gte("date_added", from).lte("date_added", to) : q.eq("date_added", today);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: tags } = useTags();
  const { data: stages } = useStages("lead");
  const { data: outreachTemplates } = useOutreachTemplates();
  const channelTemplates = useMemo(() => templatesForChannel(outreachTemplates, channel?.id ?? null), [outreachTemplates, channel?.id]);
  const { data: followupTemplates } = useFollowupTemplates();
  const tagMap = useMemo(() => new Map(((tags ?? []) as any[]).map((t) => [t.id, t])), [tags]);

  const setTags = async (lead: any, next: string[]) => {
    const cur: string[] = lead.lead_tags.map((t: any) => t.tag_id);
    const add = next.filter((id) => !cur.includes(id));
    const del = cur.filter((id) => !next.includes(id));
    if (add.length) {
      const { error } = await supabase.from("lead_tags").insert(add.map((tag_id) => ({ lead_id: lead.id, tag_id })) as never);
      if (error) return toast.error(error.message);
    }
    if (del.length) {
      const { error } = await supabase.from("lead_tags").delete().eq("lead_id", lead.id).in("tag_id", del);
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["rapid-today", kind] });
  };

  const toggleField = async (lead: any, field: string) => {
    const val = !lead[field];
    const patch: Record<string, any> = { [field]: val, [`${field}_at`]: val ? new Date().toISOString() : null };
    if (val && channel) {
      if (field.endsWith("_replied")) patch.reply_channel_id = channel.id;
      else patch.contacted_channel_id = channel.id;
    }
    const st = autoStageForOutreach(stages, lead.stage_id, patch);
    if (st) patch.stage_id = st.id;
    const { error } = await supabase.from("leads").update(patch as never).eq("id", lead.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rapid-today", kind] });
    syncLeadToSheet(lead.id).catch((err) => console.error("Google Sheet sync failed:", err));
  };

  const setFollowupDate = async (lead: any, date: string | null) => {
    const { error } = await supabase.from("leads").update({ next_followup_date: date } as never).eq("id", lead.id);
    if (error) return toast.error(error.message);
    toast.success(date ? `Follow-up scheduled for ${fmtDate(date)}` : "Follow-up cleared");
    qc.invalidateQueries({ queryKey: ["rapid-today", kind] });
    qc.invalidateQueries({ queryKey: ["dashboard-active-leads"] });
  };

  const heading =
    range?.rangeKey === "today"
      ? "Today's Stream"
      : range?.rangeKey === "week"
        ? "This Week's Stream"
        : range?.rangeKey === "month"
          ? "This Month's Stream"
          : range?.rangeKey === "30d"
            ? "Last 30 Days' Stream"
            : range?.rangeKey === "custom"
              ? `Stream (${fmtDate(range.from)} - ${fmtDate(range.to)})`
              : "Today's Stream";

  const preset = (lead: any, days: number, label: string) => (
    <button
      type="button"
      onClick={() => void setFollowupDate(lead, addDaysISO(days, today))}
      className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-[11px] hover:bg-subtle"
    >
      <span>{label}</span>
      <span className="text-[10px] text-muted-foreground">{fmtDate(addDaysISO(days, today))}</span>
    </button>
  );

  return (
    <Card title={`${heading}${rows ? ` (${rows.length})` : ""}`}>
      {!channel ? (
        <EmptyState title="No channel yet" hint={`Add a ${kind} channel in Settings to start adding leads here.`} />
      ) : isLoading ? (
        <Loading label="Loading leads" />
      ) : !rows?.length ? (
        <EmptyState title="No leads in this timeframe" hint="Leads you add in this date range show up here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <th className="w-8 py-2 font-normal">Link</th>
                <th className="py-2 font-normal">Lead</th>
                <th className="py-2 font-normal">Outreach (click to change)</th>
                <th className="py-2 font-normal">Tags</th>
                <th className="py-2 font-normal">Follow-up</th>
                <th className="w-8 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const href = profileLink(kind, lead);
                return (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-subtle/30 transition-colors">
                    <td className="py-2">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="inline-flex text-muted-foreground hover:text-foreground" title="Open profile">
                          {kind === "email" ? <Mail className="size-4" /> : <ExternalLink className="size-4" />}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => openLead(lead.id)}
                        className="text-left font-medium text-foreground hover:underline cursor-pointer block"
                        title="Click to view full lead details in side panel"
                      >
                        {lead.company_name}
                      </button>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{lead.lead_code}</span>
                        {lead.primary_contact && lead.primary_contact !== lead.company_name && <span>· {lead.primary_contact}</span>}
                        {lead.sender_accounts?.label && <span>· via {lead.sender_accounts.label}</span>}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {OUTREACH_FIELDS[kind].map((f) => (
                          <button
                            key={f.field}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => void toggleField(lead, f.field)}
                            title={lead[f.field] ? `Click to mark as "${f.off}"` : `Click to mark as "${f.on}"`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 transition-colors",
                              lead[f.field]
                                ? "border-positive font-medium text-positive bg-positive/10"
                                : "border-dashed border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
                            )}
                          >
                            {lead[f.field] ? <Check className="size-3" /> : null}
                            {lead[f.field] ? f.on : f.off}
                          </button>
                        ))}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              title="Open message templates"
                              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-subtle hover:text-foreground"
                            >
                              <MessageSquare className="size-3" />
                              Message
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-80 p-3">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between border-b border-border pb-1.5">
                                <span className="text-[12px] font-semibold text-foreground">Outreach Templates</span>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{kind}</span>
                              </div>
                              {channelTemplates.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground py-2 text-center">
                                  No outreach templates found. Create reusable templates in Settings &gt; Outreach templates.
                                </p>
                              ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                  {channelTemplates.map((tpl: any) => {
                                    const text = fillTemplate(tpl.body, { name: lead.primary_contact, company: lead.company_name });
                                    return (
                                      <div key={tpl.id} className="rounded-md border border-border p-2 bg-subtle/30 space-y-1.5">
                                        <div className="font-medium text-[11px] text-foreground truncate">{tpl.name}</div>
                                        <div className="text-[10.5px] text-muted-foreground line-clamp-3 bg-background p-1.5 rounded border border-border/60 font-mono whitespace-pre-wrap">
                                          {text}
                                        </div>
                                        <div className="flex items-center gap-1.5 pt-0.5">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-[10px] px-2 gap-1"
                                            onClick={async () => {
                                              await navigator.clipboard.writeText(text);
                                              toast.success(`Copied "${tpl.name}" to clipboard`);
                                            }}
                                          >
                                            <Copy className="size-2.5" /> Copy
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="h-6 text-[10px] px-2 gap-1"
                                            onClick={async () => {
                                              await navigator.clipboard.writeText(text);
                                              toast.success("Copied message and marking sent");
                                              const f = `${kind}_sent`;
                                              if (!lead[f]) void toggleField(lead, f);
                                            }}
                                          >
                                            <Check className="size-2.5" /> Copy &amp; Mark Sent
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {lead.lead_tags.map(({ tag_id }: any) => {
                          const t = tagMap.get(tag_id);
                          return t ? (
                            <span
                              key={tag_id}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                              {t.name}
                            </span>
                          ) : null;
                        })}
                        {canEdit && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                title="Add or remove tags"
                                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-subtle hover:text-foreground"
                              >
                                <Tag className="size-3" />
                                {lead.lead_tags.length ? "Edit" : "Add"}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-80">
                              <TagPicker compact selected={lead.lead_tags.map((t: any) => t.tag_id)} onChange={(ids) => void setTags(lead, ids)} />
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </td>
                    <td className="py-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={!canEdit}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                              lead.next_followup_date
                                ? "border-border bg-subtle text-foreground font-medium"
                                : "border-dashed border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
                            )}
                            title="Set or change follow-up date"
                          >
                            <Calendar className="size-3" />
                            {lead.next_followup_date ? fmtDate(lead.next_followup_date) : "None"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 p-3">
                          <div className="space-y-3">
                            <div className="text-[12px] font-semibold text-foreground">Schedule Follow-up</div>
                            <div className="space-y-1">
                              <div className="text-[10px] font-medium uppercase text-muted-foreground tracking-wider">Quick Presets</div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {preset(lead, 2, "+2 Days")}
                                {preset(lead, 3, "+3 Days")}
                                {preset(lead, 1, "Tomorrow")}
                                {preset(lead, 7, "+1 Week")}
                              </div>
                            </div>
                            {followupTemplates && followupTemplates.length > 0 && (
                              <div className="space-y-1 pt-1 border-t border-border">
                                <div className="text-[10px] font-medium uppercase text-muted-foreground tracking-wider">Sequence Templates</div>
                                <div className="space-y-1 max-h-28 overflow-y-auto">
                                  {followupTemplates.map((tpl) => {
                                    const off = tpl.steps?.[0]?.offset_days ?? 2;
                                    const d = addDaysISO(off, today);
                                    return (
                                      <button
                                        key={tpl.id}
                                        type="button"
                                        onClick={() => void setFollowupDate(lead, d)}
                                        className="w-full text-left rounded-md px-2 py-1 text-[11px] hover:bg-subtle flex items-center justify-between"
                                      >
                                        <span className="truncate">{tpl.name}</span>
                                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">+{off}d</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div className="space-y-1 pt-1 border-t border-border">
                              <div className="text-[10px] font-medium uppercase text-muted-foreground tracking-wider">Custom Date</div>
                              <DatePicker
                                value={lead.next_followup_date || undefined}
                                minDate={today}
                                placeholder="Pick follow-up date"
                                onChange={(v: string | null) => {
                                  if (v) void setFollowupDate(lead, v);
                                }}
                                className="w-full text-xs"
                              />
                            </div>
                            {lead.next_followup_date && (
                              <div className="pt-1 border-t border-border">
                                <button
                                  type="button"
                                  onClick={() => void setFollowupDate(lead, null)}
                                  className="w-full rounded-md px-2 py-1 text-center text-[11px] text-destructive hover:bg-destructive/10"
                                >
                                  Clear Follow-up
                                </button>
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        to="/lt/leads/$id"
                        params={{ id: lead.id }}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-muted-foreground hover:text-foreground"
                        title="Open lead details in a new tab"
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
