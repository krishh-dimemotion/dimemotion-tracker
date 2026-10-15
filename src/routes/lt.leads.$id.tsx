/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported from live chunk lt.leads._id-KGC4i_M0.js
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  CircleDashed,
  Check,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Copy,
  Eraser,
  ExternalLink,
  Instagram,
  Linkedin,
  Mail,
  Plus,
  Settings2,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { AppPage } from "@/components/app-shell";
import {
  CheckDate,
  CollapsibleCard,
  DatePicker,
  EmptyState,
  Loading,
  MANUAL_HELPER,
  Pill,
} from "@/components/live/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { isTypingTarget } from "@/lib/shortcuts";
import { useStages, useChannels, useSenderAccounts, useCountries, useTags } from "@/hooks/useLookups";
import { StagePill } from "@/components/leads/StagePill";
import { CopyButton, LinkInput, VerifyToggle } from "@/components/lt/copy-button";
import { EventRow, AddActivityForm, useEventActions } from "@/components/lt/events";
import { LeadTasksCard } from "@/components/lt/tasks";
import { autoStageForOutreach, normalizeForChannel } from "@/lib/live/config";
import { TemplateSelect } from "@/components/live/template-select";
import { findDuplicateLead, DUPLICATE_MATCH_LABELS } from "@/lib/live/duplicate-detector";
import { followupPauseReason, skipPendingFollowups, resumeSkippedFollowups } from "@/lib/live/followup-actions";
import { useOutreachTemplates, renderTemplate } from "@/lib/live/outreach-templates";

export const Route = createFileRoute("/lt/leads/$id")({
  head: () => ({
    meta: [
      { title: "Lead | Lead Tracker" },
      { name: "description", content: "Full lead detail: company info, people, outreach and activity." },
      { property: "og:title", content: "Lead | Lead Tracker" },
      { property: "og:description", content: "Full lead detail: company info, people, outreach and activity." },
    ],
  }),
  component: LeadDetailPage,
});

type AnyRow = Record<string, any>;

// types-BOm9CRLy.js
const STATUS_OPTIONS = ["new", "in_progress", "on_hold", "won", "lost"];
const PRIORITY_OPTIONS = ["low", "medium", "high"];
const SENTIMENT_OPTIONS = ["positive", "neutral", "negative"];

// kit Iu / Ru (not in shared kit export list, kept local)
function fmtDate(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function toDateInput(v: string | null | undefined) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}

// app-shell Aa / Ba / Va (event meta + email list helpers)
function eventMeta(e: AnyRow): AnyRow {
  return e.meta && typeof e.meta === "object" ? e.meta : {};
}
type EmailEntry = { email: string; verified: boolean };
function normalizeEmails(v: unknown): EmailEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => {
      if (typeof e === "string") return e.trim() ? { email: e.trim(), verified: false } : null;
      if (e && typeof e === "object" && typeof (e as AnyRow).email === "string")
        return { email: (e as AnyRow).email.trim(), verified: !!(e as AnyRow).verified };
      return null;
    })
    .filter((e): e is EmailEntry => !!e && !!e.email);
}
function addEmail(list: EmailEntry[], input: string, primary?: string | null): EmailEntry[] {
  const v = normalizeForChannel("email", input).trim();
  if (!v) return list;
  const low = v.toLowerCase();
  if (list.some((e) => e.email.toLowerCase() === low) || (primary ?? "").toLowerCase() === low) return list;
  return [...list, { email: v, verified: false }];
}

/* ---------- message angles ---------- */
const ANGLES_KEY = "message_angles";
const ANGLES_QK = ["app_settings", ANGLES_KEY];
const DEFAULT_ANGLES = ["Loom", "Audit", "Personal audit", "Breakdown"];

function parseAngles(v: unknown) {
  const a = v && typeof v === "object" ? (v as AnyRow).angles : undefined;
  return Array.isArray(a)
    ? a.filter((e) => typeof e === "string" && e.trim().length > 0).map((e: string) => e.trim())
    : DEFAULT_ANGLES;
}
function useAngles() {
  return useQuery({
    queryKey: ANGLES_QK,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", ANGLES_KEY).maybeSingle();
      if (error) throw error;
      return data ? parseAngles(data.value) : DEFAULT_ANGLES;
    },
    staleTime: 3e5,
  });
}
async function saveAngles(angles: string[]) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: ANGLES_KEY, value: { angles } } as never, { onConflict: "workspace_id,key" });
  if (error) throw error;
}

function PersonalizedMessageCard({ lead, canEdit, onSave }: { lead: AnyRow; canEdit: boolean; onSave: (p: AnyRow) => void }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: angles = [] } = useAngles();
  const [msg, setMsg] = useState<string>(lead.personalized_message ?? "");
  const [angle, setAngle] = useState<string | null>(lead.message_angle ?? null);
  const [templateId, setTemplateId] = useState<string | null>(lead.outreach_template_id ?? null);
  const [newAngle, setNewAngle] = useState("");
  const [managing, setManaging] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMsg(lead.personalized_message ?? "");
    setAngle(lead.message_angle ?? null);
    setTemplateId(lead.outreach_template_id ?? null);
  }, [lead.id]);

  const shown = angle && !angles.some((a) => a.toLowerCase() === angle.toLowerCase()) ? [...angles, angle] : angles;
  const pick = (a: string) => {
    if (!canEdit || managing) return;
    const next = angle === a ? null : a;
    setAngle(next);
    onSave({ message_angle: next });
  };
  const persist = async (next: string[]) => {
    const prev = angles;
    qc.setQueryData(ANGLES_QK, next);
    try {
      await saveAngles(next);
    } catch (e) {
      qc.setQueryData(ANGLES_QK, prev);
      toast.error(e instanceof Error ? e.message : "Could not save the angle list");
    }
  };
  const add = () => {
    const v = newAngle.trim();
    if (!v) return;
    const existing = angles.find((a) => a.toLowerCase() === v.toLowerCase());
    setNewAngle("");
    if (!existing) void persist([...angles, v]);
    const chosen = existing ?? v;
    if (canEdit && angle !== chosen) {
      setAngle(chosen);
      onSave({ message_angle: chosen });
    }
  };
  const removeAngle = (a: string) => {
    if (window.confirm(`Remove the angle "${a}" from the list? Leads already using it keep it.`))
      void persist(angles.filter((x) => x !== a));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };
  const copy = async () => {
    if (!msg.trim()) return toast.error("Write the message first.");
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Message copied");
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };
  const blur = () => {
    if (msg !== (lead.personalized_message ?? "")) onSave({ personalized_message: msg || null });
  };
  const onTemplate = (t: AnyRow | null) => {
    setTemplateId(t?.id ?? null);
    if (!t) return onSave({ outreach_template_id: null });
    const body = renderTemplate(t.body, { name: lead.primary_contact, company: lead.company_name });
    const replace = body.trim() && (!msg.trim() || window.confirm("Replace the current message with this template?"));
    if (replace) setMsg(body);
    onSave({ outreach_template_id: t.id, ...(replace ? { personalized_message: body } : {}) });
  };
  const words = msg.trim() ? msg.trim().split(/\s+/).length : 0;

  return (
    <CollapsibleCard id="lead.personalized_message" title="Personalized message">
      <div className="flex flex-col gap-4">
        <div>
          <div className="label-text mb-1.5">Outreach template</div>
          <TemplateSelect
            channelId={lead.contacted_channel_id ?? lead.channel_id ?? null}
            value={templateId}
            onChange={onTemplate}
            disabled={!canEdit}
            className="w-full max-w-[320px]"
            showManageLink={canEdit}
          />
        </div>
        <div>
          <div className="label-text mb-1.5">Angle</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {shown.map((a) => {
              const on = angle === a;
              return (
                <button
                  key={a}
                  type="button"
                  disabled={!canEdit && !managing}
                  onClick={() => pick(a)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
                    managing && "cursor-default",
                  )}
                >
                  {on && !managing && <Check className="size-3" />}
                  {a}
                  {managing && angles.includes(a) && (
                    <X
                      className="size-3 cursor-pointer text-negative"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeAngle(a);
                      }}
                    />
                  )}
                </button>
              );
            })}
            {isAdmin && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Input
                    value={newAngle}
                    onChange={(e) => setNewAngle(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="New angle"
                    className="h-7 w-28 text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={add}
                    title="Add angle"
                    className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-subtle hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </span>
                {angles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setManaging((m) => !m)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]",
                      managing
                        ? "border-negative text-negative"
                        : "border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
                    )}
                  >
                    <Settings2 className="size-3.5" />
                    {managing ? "Done" : "Manage"}
                  </button>
                )}
              </>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            The approach and next step for this lead, e.g. a Loom for high-potential leads, an audit for the rest.
          </p>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="label-text">Message</span>
            <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => void copy()}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Textarea
            className="min-h-[140px] text-[13px] leading-relaxed"
            placeholder="Write the personalized message you'll send this lead…"
            value={msg}
            disabled={!canEdit}
            onChange={(e) => setMsg(e.target.value)}
            onBlur={blur}
          />
          <div className="mt-1 text-right text-[11px] text-muted-foreground">
            {words} {words === 1 ? "word" : "words"} · {msg.length} characters
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}

/* ---------- stage gap logic ---------- */
const hasContact = (l: AnyRow) => !!(l.email_sent || l.linkedin_sent || l.instagram_sent || l.linkedin_connection_sent);
const hasReply = (l: AnyRow) => !!(l.email_replied || l.linkedin_replied || l.instagram_replied);
const isContactStage = (s?: AnyRow | null) => !!(s && /^contact/i.test(s.name.trim()));
const isReplyStage = (s?: AnyRow | null) => !!(s && (s.is_reply_stage || /^repl/i.test(s.name.trim())));

type GapMode = "reply" | "contact";
function stageGap(lead: AnyRow, stages: AnyRow[]): GapMode | null {
  const cur = stages.find((s) => s.id === lead.stage_id);
  if (!cur || cur.is_won || cur.is_lost) return null;
  const c = stages.find(isContactStage);
  const r = stages.find(isReplyStage);
  if (r && cur.order_index >= r.order_index && !hasReply(lead)) return "reply";
  if (c && cur.order_index >= c.order_index && !hasContact(lead)) return "contact";
  return null;
}

type ChannelOpt = { field: string; label: string; kind: string; icon: LucideIcon };
const CONTACT_OPTS: ChannelOpt[] = [
  { field: "email_sent", label: "Email", kind: "email", icon: Mail },
  { field: "linkedin_sent", label: "LinkedIn message", kind: "linkedin", icon: Linkedin },
  { field: "instagram_sent", label: "Instagram", kind: "instagram", icon: Instagram },
  { field: "linkedin_connection_sent", label: "Connection request", kind: "linkedin", icon: UserPlus },
];
const REPLY_OPTS: ChannelOpt[] = [
  { field: "email_replied", label: "Email", kind: "email", icon: Mail },
  { field: "linkedin_replied", label: "LinkedIn", kind: "linkedin", icon: Linkedin },
  { field: "instagram_replied", label: "Instagram", kind: "instagram", icon: Instagram },
];

function gapPatch(mode: GapMode, field: string, channels: AnyRow[]) {
  const opt = [...CONTACT_OPTS, ...REPLY_OPTS].find((o) => o.field === field);
  const ch =
    channels.find((c) => (c.kind ?? "").toLowerCase() === opt?.kind) ??
    channels.find((c) => c.name.toLowerCase().includes(opt?.kind ?? "~"));
  const now = new Date().toISOString();
  return {
    [field]: true,
    [`${field}_at`]: now,
    ...(ch ? { [mode === "contact" ? "contacted_channel_id" : "reply_channel_id"]: ch.id } : {}),
    ...(mode === "contact" ? { last_contacted_at: now } : {}),
  };
}

function ChannelPickDialog({
  mode,
  stageName,
  onPick,
  onSkip,
  onClose,
}: {
  mode: GapMode | null;
  stageName?: string | null;
  onPick: (field: string) => void;
  onSkip?: () => void;
  onClose: () => void;
}) {
  const opts = mode === "reply" ? REPLY_OPTS : CONTACT_OPTS;
  return (
    <Dialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{mode === "reply" ? "Where did they reply?" : "How did you contact them?"}</DialogTitle>
          <DialogDescription>
            {stageName ? `Moving to "${stageName}". ` : ""}
            Pick the channel so Activity, the Ledger and your outreach numbers stay accurate.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {opts.map((o) => (
            <Button
              key={o.field}
              variant="outline"
              className="h-11 min-w-0 justify-start gap-2.5 px-3 text-left whitespace-normal"
              onClick={() => onPick(o.field)}
            >
              <o.icon className="size-4 shrink-0" />
              <span className="leading-tight">{o.label}</span>
            </Button>
          ))}
        </div>
        {onSkip && (
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip, just change the stage
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GapWarning({ gap, onLog, canEdit }: { gap: GapMode | null; onLog: () => void; canEdit: boolean }) {
  if (!gap) return null;
  return (
    <div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-warning px-2 py-1 text-[12px] text-warning">
      <TriangleAlert className="size-3.5" />
      {gap === "reply" ? "No reply logged" : "No outreach logged"}
      {canEdit && (
        <button type="button" onClick={onLog} className="ml-1 font-medium underline underline-offset-2">
          Log it
        </button>
      )}
    </div>
  );
}

async function warnDuplicate(input: AnyRow, leadId: string) {
  const d = await findDuplicateLead(input, { excludeLeadId: leadId });
  if (d)
    toast.warning(`Possible duplicate: ${d.companyName} (${d.leadCode}) has the ${DUPLICATE_MATCH_LABELS[d.matchedOn]}.`, {
      duration: 12e3,
      action: { label: "Open lead", onClick: () => window.open(`/lt/leads/${d.leadId}`, "_blank", "noopener") },
    });
}

/* ---------- people ---------- */
function ContactRow({
  contact,
  canEdit,
  canRemove,
  onChange,
  onRemove,
}: {
  contact: AnyRow;
  canEdit: boolean;
  canRemove: boolean;
  onChange: (p: AnyRow) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(contact.person_name ?? "");
  const [title, setTitle] = useState(contact.job_title ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [linkedin, setLinkedin] = useState(contact.linkedin_url ?? "");
  const [instagram, setInstagram] = useState(contact.instagram_url ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [extra, setExtra] = useState("");
  const emails = normalizeEmails(contact.emails);

  const addExtra = () => {
    if (!extra.trim()) return;
    const next = addEmail(emails, extra, contact.email);
    setExtra("");
    if (next === emails) return;
    onChange({ emails: next });
    void warnDuplicate({ email: next[next.length - 1].email }, contact.lead_id);
  };

  useEffect(() => {
    setName(contact.person_name ?? "");
    setTitle(contact.job_title ?? "");
    setEmail(contact.email ?? "");
    setLinkedin(contact.linkedin_url ?? "");
    setInstagram(contact.instagram_url ?? "");
    setPhone(contact.phone ?? "");
  }, [contact.id]);

  return (
    <div className="rounded-lg border border-border/80 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          placeholder="Person name"
          className="h-8 text-[13px]"
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (contact.person_name ?? "") && onChange({ person_name: name || null })}
        />
        <Input
          placeholder="Job title"
          className="h-8 text-[13px]"
          value={title}
          disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== (contact.job_title ?? "") && onChange({ job_title: title || null })}
        />
        <div className="flex items-center gap-1.5">
          <LinkInput
            kind="email"
            placeholder="Email"
            wrapperClassName="min-w-0 flex-1"
            className="h-8 text-[13px]"
            value={email}
            disabled={!canEdit}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => {
              const v = normalizeForChannel("email", email);
              setEmail(v);
              if (v !== (contact.email ?? "")) {
                onChange({ email: v || null, ...(contact.email_verified ? { email_verified: false } : {}) });
                if (v) void warnDuplicate({ email: v }, contact.lead_id);
              }
            }}
          />
          <CopyButton text={email} />
          {(email.trim() || contact.email_verified) && (
            <VerifyToggle
              verified={!!contact.email_verified}
              disabled={!canEdit}
              onToggle={(v) => {
                const n = normalizeForChannel("email", email);
                onChange({ email_verified: v, ...(n && n !== (contact.email ?? "") ? { email: n } : {}) });
              }}
            />
          )}
        </div>
        <LinkInput
          placeholder="LinkedIn URL"
          className="h-8 text-[13px]"
          value={linkedin}
          disabled={!canEdit}
          onChange={(e) => setLinkedin(e.target.value)}
          onBlur={() => {
            const v = normalizeForChannel("linkedin", linkedin);
            setLinkedin(v);
            if (v !== (contact.linkedin_url ?? "")) {
              onChange({ linkedin_url: v || null });
              if (v) void warnDuplicate({ linkedin: v }, contact.lead_id);
            }
          }}
        />
        <LinkInput
          placeholder="Instagram URL"
          className="h-8 text-[13px]"
          value={instagram}
          disabled={!canEdit}
          onChange={(e) => setInstagram(e.target.value)}
          onBlur={() => {
            const v = normalizeForChannel("instagram", instagram);
            setInstagram(v);
            if (v !== (contact.instagram_url ?? "")) {
              onChange({ instagram_url: v || null });
              if (v) void warnDuplicate({ instagram: v }, contact.lead_id);
            }
          }}
        />
        <Input
          placeholder="Phone"
          className="h-8 text-[13px]"
          value={phone}
          disabled={!canEdit}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => phone !== (contact.phone ?? "") && onChange({ phone: phone || null })}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {emails.map((em, i) => (
          <span
            key={`${em.email}-${i}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px]",
              em.verified ? "border-positive" : "border-border",
            )}
          >
            <button
              type="button"
              disabled={!canEdit}
              aria-pressed={em.verified}
              title={em.verified ? "Verified. Click to mark as not verified." : "Not verified. Click to mark as verified."}
              onClick={() => onChange({ emails: emails.map((x, j) => (j === i ? { ...x, verified: !x.verified } : x)) })}
              className={cn(
                "inline-flex items-center",
                em.verified ? "text-positive" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {em.verified ? <BadgeCheckIcon /> : <CircleDashedIcon />}
            </button>
            <a href={`mailto:${em.email}`} className="hover:underline">
              {em.email}
            </a>
            <CopyButton text={em.email} size="sm" />
            {canEdit && (
              <button
                type="button"
                title="Remove this email"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange({ emails: emails.filter((_, j) => j !== i) })}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <div className="flex items-center gap-1">
            <Input
              placeholder="Additional email"
              className="h-7 w-[180px] text-[12px]"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExtra();
                }
              }}
            />
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={addExtra}>
              Add email
            </Button>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={!!contact.is_primary}
            disabled={!canEdit}
            onChange={(e) => onChange({ is_primary: e.target.checked })}
          />
          Primary contact
        </label>
        {canEdit && canRemove && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

const BadgeCheckIcon = () => <BadgeCheck className="size-3.5" />;
const CircleDashedIcon = () => <CircleDashed className="size-3.5" />;

function PeopleCard({
  contacts,
  canEdit,
  onChange,
  onAdd,
  onRemove,
}: {
  contacts: AnyRow[];
  canEdit: boolean;
  onChange: (id: string, p: AnyRow) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <CollapsibleCard id="lead.people" title="People">
      <div className="flex flex-col gap-3">
        {contacts.map((c) => (
          <ContactRow
            key={c.id}
            contact={c}
            canEdit={canEdit}
            canRemove={contacts.length > 1}
            onChange={(p) => onChange(c.id, p)}
            onRemove={() => onRemove(c.id)}
          />
        ))}
        {canEdit && (
          <Button variant="outline" size="sm" className="w-fit" onClick={onAdd}>
            <Plus className="mr-1 size-3.5" /> Add person
          </Button>
        )}
      </div>
    </CollapsibleCard>
  );
}

/* ---------- follow-ups ---------- */
function FuDate({ value, disabled, onSave }: { value: string | null; disabled?: boolean; onSave: (v: string | null) => void; ariaLabel?: string }) {
  return (
    <DatePicker
      value={toDateInput(value) || undefined}
      disabled={disabled}
      placeholder="Pick date"
      onChange={(v: string) => onSave(v ? new Date(v + "T12:00:00").toISOString() : null)}
      className="h-8 min-w-0 text-[13px]"
    />
  );
}

function FollowupRow({
  fu,
  channels,
  canEdit,
  defaultChannelId,
  lead,
  onChange,
  onDelete,
}: {
  fu: AnyRow;
  channels: AnyRow[];
  canEdit: boolean;
  defaultChannelId: string | null;
  lead: AnyRow;
  onChange: (p: AnyRow) => void;
  onDelete?: () => void;
}) {
  const [notes, setNotes] = useState(fu.notes ?? "");
  useEffect(() => setNotes(fu.notes ?? ""), [fu.id, fu.notes]);
  const { data: templates } = useOutreachTemplates();
  const tpl = fu.outreach_template_id ? (templates ?? []).find((t: AnyRow) => t.id === fu.outreach_template_id) : undefined;
  const sent = fu.status === "sent";
  const skipped = fu.status === "skipped";
  const copy = async () => {
    if (!tpl) return;
    try {
      await navigator.clipboard.writeText(renderTemplate(tpl.body, lead));
      toast.success("Message copied");
    } catch {
      toast.error("Could not copy the message.");
    }
  };
  return (
    <div
      className={cn("flex flex-col gap-2 rounded-lg border border-border/80 p-2.5", sent && "bg-subtle/40", skipped && "opacity-55")}
      title={skipped ? "Stopped" : undefined}
    >
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto_32px]">
        <div className="text-[12px] font-medium text-muted-foreground">#{fu.sequence_number}</div>
        <FuDate
          ariaLabel={`Follow-up ${fu.sequence_number} date`}
          value={fu.scheduled_date}
          disabled={!canEdit}
          onSave={(v) => onChange({ scheduled_date: v })}
        />
        <Select
          key={fu.channel_id ?? "none"}
          {...(fu.channel_id ? { value: fu.channel_id } : {})}
          disabled={!canEdit}
          onValueChange={(v) => onChange({ channel_id: v })}
        >
          <SelectTrigger className="h-8 min-w-0 text-[13px]">
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
        <div className="flex min-w-0 items-center gap-1">
          <TemplateSelect
            channelId={fu.channel_id ?? defaultChannelId}
            value={fu.outreach_template_id ?? null}
            disabled={!canEdit}
            onChange={(t: AnyRow | null) => onChange({ outreach_template_id: t?.id ?? null })}
            placeholder="Message template"
            className="flex-1"
          />
          {tpl && (
            <Button variant="ghost" size="icon" className="size-8 shrink-0" title="Copy this message" onClick={() => void copy()}>
              <Copy className="size-3.5" />
            </Button>
          )}
        </div>
        <label className="flex items-center gap-2 text-[13px] whitespace-nowrap">
          <Checkbox
            checked={sent}
            disabled={!canEdit}
            onCheckedChange={(v) => {
              const on = v === true;
              onChange({ status: on ? "sent" : "pending", sent_at: on ? new Date().toISOString() : null });
            }}
          />
          Sent
        </label>
        {onDelete ? (
          <Button variant="ghost" size="icon" className="size-8" title="Delete this follow-up" onClick={onDelete}>
            <Trash2 className="size-4 text-negative" />
          </Button>
        ) : (
          <span />
        )}
      </div>
      <div className={cn("grid grid-cols-1 gap-2", sent && "sm:grid-cols-[180px_minmax(0,1fr)]")}>
        {sent && (
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="shrink-0">Sent on</span>
            <FuDate
              ariaLabel={`Follow-up ${fu.sequence_number} sent date`}
              value={fu.sent_at}
              disabled={!canEdit}
              onSave={(v) => onChange({ sent_at: v })}
            />
          </label>
        )}
        <Textarea
          placeholder="Notes"
          className="h-8 min-h-8 text-[13px]"
          disabled={!canEdit}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (fu.notes ?? "") && onChange({ notes: notes || null })}
        />
      </div>
    </div>
  );
}

function FollowupsCard({
  followups,
  channels,
  canEdit,
  leadId,
  lastContactedAt,
  outreachAt,
  defaultChannelId = null,
  lead = {},
  onChange,
  onAdd,
  invalidate,
  pauseReason = null,
}: {
  followups: AnyRow[];
  channels: AnyRow[];
  canEdit: boolean;
  leadId: string;
  lastContactedAt: string | null;
  outreachAt: string | null;
  defaultChannelId?: string | null;
  lead?: AnyRow;
  onChange: (id: string, p: AnyRow) => void;
  onAdd: () => void;
  invalidate: () => void;
  pauseReason?: string | null;
}) {
  const sorted = [...followups].sort((a, b) => a.sequence_number - b.sequence_number);
  const templatesQ = useQuery({
    queryKey: ["followup_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("followup_templates" as never).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as AnyRow[];
    },
  });
  const channelForKind = (kind?: string | null) => {
    if (!kind) return null;
    const k = kind.toLowerCase();
    return channels.find((c) => c.name.toLowerCase().includes(k))?.id ?? null;
  };
  const isBlank = (f: AnyRow) =>
    !f.scheduled_date && f.status !== "sent" && !f.sent_at && !f.channel_id && !(f.notes ?? "").trim();

  const applyTemplate = async (tpl: AnyRow) => {
    const steps: AnyRow[] = Array.isArray(tpl.steps) ? tpl.steps : [];
    if (steps.length === 0) {
      toast.error("This template has no steps");
      return;
    }
    const base = outreachAt ?? lastContactedAt;
    const d = base ? new Date(base) : new Date();
    d.setHours(12, 0, 0, 0);
    const blanks = sorted.filter(isBlank);
    let seq = sorted.length ? Math.max(...sorted.map((f) => f.sequence_number)) + 1 : 1;
    const updates: PromiseLike<any>[] = [];
    const inserts: AnyRow[] = [];
    steps.forEach((s, i) => {
      d.setDate(d.getDate() + Math.max(0, Number(s.offset_days) || 0));
      const row = {
        scheduled_date: d.toISOString(),
        status: "pending",
        sent_at: null,
        channel_id: channelForKind(s.channel_kind),
        notes: s.label?.trim() || null,
      };
      const blank = blanks[i];
      if (blank) updates.push(supabase.from("lead_followups").update(row as never).eq("id", blank.id));
      else inserts.push({ lead_id: leadId, sequence_number: seq++, ...row });
    });
    const res = await Promise.all([
      ...updates,
      ...(inserts.length ? [supabase.from("lead_followups").insert(inserts as never)] : []),
    ]);
    const bad = res.find((r: AnyRow) => r.error);
    if (bad?.error) toast.error(bad.error.message);
    else toast.success(`Applied "${tpl.name}" from ${base ? "the outreach date" : "today"}`);
    invalidate();
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all follow-ups? Dates, channels, sent marks and notes are removed and the list goes back to 5.")) return;
    const keep = sorted.filter((f) => f.sequence_number <= 5).map((f) => f.id);
    const drop = sorted.filter((f) => f.sequence_number > 5).map((f) => f.id);
    const res = await Promise.all([
      ...(keep.length
        ? [
            supabase
              .from("lead_followups")
              .update({ scheduled_date: null, status: "pending", sent_at: null, channel_id: null, notes: null } as never)
              .in("id", keep),
          ]
        : []),
      ...(drop.length ? [supabase.from("lead_followups").delete().in("id", drop)] : []),
    ]);
    const bad = res.find((r: AnyRow) => r.error);
    if (bad?.error) toast.error(bad.error.message);
    else toast.success("Follow-ups cleared");
    invalidate();
  };

  const remove = async (f: AnyRow) => {
    if (!isBlank(f) && !window.confirm(`Delete follow-up #${f.sequence_number}?`)) return;
    const { error } = await supabase.from("lead_followups").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    const after = sorted.filter((x) => x.sequence_number > f.sequence_number);
    await Promise.all(
      after.map((x) => supabase.from("lead_followups").update({ sequence_number: x.sequence_number - 1 } as never).eq("id", x.id)),
    );
    invalidate();
  };

  const quick = async (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    const row = { scheduled_date: d.toISOString(), status: "pending", channel_id: defaultChannelId };
    const blank = sorted.find(isBlank);
    const { error } = blank
      ? await supabase.from("lead_followups").update(row as never).eq("id", blank.id)
      : await supabase.from("lead_followups").insert({
          lead_id: leadId,
          sequence_number: sorted.length ? Math.max(...sorted.map((f) => f.sequence_number)) + 1 : 1,
          ...row,
        } as never);
    if (error) return toast.error(error.message);
    toast.success(`Follow-up set for ${fmtDate(d.toISOString())}`);
    invalidate();
  };

  const hasPending = sorted.some((f) => f.status === "pending" && (f.scheduled_date || f.notes || f.outreach_template_id));
  const hasSkipped = sorted.some((f) => f.status === "skipped");
  const stop = async () => {
    const err = await skipPendingFollowups(leadId);
    if (err) return toast.error(err.message);
    toast.success("Follow-ups stopped. Nothing was deleted.");
    invalidate();
  };
  const resume = async () => {
    const err = await resumeSkippedFollowups(leadId);
    if (err) return toast.error(err.message);
    toast.success("Follow-ups resumed");
    invalidate();
  };
  const next = sorted
    .filter((f) => f.status === "pending" && f.scheduled_date)
    .map((f) => f.scheduled_date as string)
    .sort()[0];

  return (
    <CollapsibleCard
      id="lead.followups"
      title="Follow-ups"
      actions={
        <span className="text-[12px] text-muted-foreground">
          {hasSkipped && !hasPending ? "Stopped" : next ? `Next: ${fmtDate(next)}` : "None scheduled"}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {pauseReason && (
          <div className="rounded-lg border border-border/80 bg-subtle/50 px-3 py-2 text-[12.5px] text-muted-foreground">
            {pauseReason === "archived"
              ? "This lead is archived, so its follow-ups are paused and won't show as due."
              : `This lead is ${pauseReason}, so its follow-ups are paused and won't show as due. Move it back to an active stage to bring them back.`}
          </div>
        )}
        {hasSkipped && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-subtle/50 px-3 py-2 text-[12.5px] text-muted-foreground">
            <span>Follow-ups for this lead were stopped. They're kept here, faded, and won't show as due.</span>
            {canEdit && (
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-[12px]" onClick={() => void resume()}>
                <CirclePlay className="mr-1 size-3.5" /> Resume follow-ups
              </Button>
            )}
          </div>
        )}
        {sorted.map((f) => (
          <FollowupRow
            key={f.id}
            fu={f}
            channels={channels}
            canEdit={canEdit}
            defaultChannelId={defaultChannelId}
            lead={lead}
            onChange={(p) => onChange(f.id, p)}
            onDelete={canEdit && sorted.length > 5 ? () => void remove(f) : undefined}
          />
        ))}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Quick follow-up in</span>
            {[2, 3, 7].map((n) => (
              <Button key={n} variant="outline" size="sm" className="h-7 px-2.5 text-[12px]" onClick={() => void quick(n)}>
                +{n} days
              </Button>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="w-fit" onClick={onAdd}>
              <Plus className="mr-1 size-3.5" /> Add follow-up
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-fit" disabled={!templatesQ.data?.length}>
                  Apply template <ChevronDown className="ml-1 size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(templatesQ.data ?? []).map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => void applyTemplate(t)}>
                    {t.name}
                    {t.is_default ? " (default)" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {hasPending && (
              <Button variant="outline" size="sm" className="ml-auto w-fit" onClick={() => void stop()}>
                <CirclePause className="mr-1 size-3.5" /> Stop follow-ups
              </Button>
            )}
            <Button variant="outline" size="sm" className={cn("w-fit", !hasPending && "ml-auto")} onClick={() => void clearAll()}>
              <Eraser className="mr-1 size-3.5" /> Clear all
            </Button>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}

/* ---------- activity ---------- */
function ActivityCard({
  events,
  leadId,
  canEdit = false,
  onChanged,
  onLeadSave,
}: {
  events: AnyRow[];
  leadId: string;
  lead?: AnyRow;
  canEdit?: boolean;
  onChanged: () => void;
  onLeadSave: (p: AnyRow) => void;
}) {
  const [adding, setAdding] = useState(false);
  const { saveEdit, remove, add } = useEventActions(onChanged);
  const sorted = [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return (
    <CollapsibleCard
      id="lead.activity"
      title="Activity"
      actions={
        canEdit && leadId && !adding ? (
          <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {adding && leadId && (
          <AddActivityForm
            leadId={leadId}
            onCancel={() => setAdding(false)}
            onAdd={async (v: AnyRow) => {
              await add(v);
              setAdding(false);
            }}
          />
        )}
        {sorted.length === 0 && !adding ? (
          <EmptyState title="No activity yet" hint="Actions on this lead will appear here." />
        ) : (
          sorted.map((e) => (
            <EventRow
              key={`${e.id}-${e.occurred_at}-${e.event_type}-${eventMeta(e).label ?? ""}`}
              e={{ ...e, lead_id: e.lead_id ?? leadId }}
              canEdit={canEdit}
              onEdit={(v: AnyRow) => saveEdit(e, v)}
              onDelete={() => void remove({ ...e, lead_id: e.lead_id ?? leadId }, onLeadSave)}
            />
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}

const STATUS_LABELS: Record<string, string> = {
  no_reply: "No reply",
  replied: "Replied",
  bounced: "Bounced",
  converted: "Converted",
  not_interested: "Not interested",
};

function useSavedFlash() {
  const [saved, setSaved] = useState<null | "saving" | "saved">(null);
  return {
    saved,
    setSaved,
    flashSaved: () => {
      setSaved("saved");
      setTimeout(() => setSaved(null), 1500);
    },
  };
}

/* ---------- page ---------- */
function LeadDetailPage() {
  const { id } = useParams({ from: "/lt/leads/$id" });
  const { user, can, isAdmin } = useAuth() as any;
  const canEdit: boolean = can("lead.leads");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyNameRef = useRef<HTMLInputElement>(null);
  const { data: stages } = useStages("lead");
  const { data: countries } = useCountries();
  const { data: channels } = useChannels();
  const { data: senderAccounts } = useSenderAccounts();
  const { data: tags } = useTags();
  const isNew = id === "new";
  const creating = useRef(false);

  useEffect(() => {
    if (id !== "new" || creating.current) return;
    creating.current = true;
    void (async () => {
      const { data, error } = await (supabase.rpc as any)("create_lead", {
        _lead: { company_name: "Untitled lead", created_by: user?.id ?? null },
        _contacts: [
          { order_index: 0, is_primary: true },
          { order_index: 1, is_primary: false },
        ],
        _followups: 5,
      });
      if (error) {
        creating.current = false;
        toast.error(error.message ?? "Failed to create lead");
        navigate({ to: "/lt/leads" });
        return;
      }
      if (data) {
        qc.invalidateQueries({ queryKey: ["leads-table"] });
        qc.invalidateQueries({ queryKey: ["leads-board"] });
        navigate({ to: "/lt/leads/$id", params: { id: data as string }, replace: true });
      }
    })();
  }, [id, user?.id, navigate, qc]);

  const leadQ = useQuery({
    queryKey: ["lead_detail", id],
    enabled: id !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, lead_contacts(*), lead_links(*), lead_followups(*), lead_tags(tag_id), crm_records(id, estimated_value)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as AnyRow | null;
    },
  });
  const eventsQ = useQuery({
    queryKey: ["lead_events", id],
    enabled: id !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_events")
        .select("id, event_type, occurred_at, meta, profiles(full_name, email)")
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnyRow[];
    },
  });
  const neighboursQ = useQuery({
    queryKey: ["lead_neighbours"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id").order("date_added", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: AnyRow) => r.id as string);
    },
  });
  const { saved, setSaved, flashSaved } = useSavedFlash();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead_detail", id] });
  const invalidateEvents = () => qc.invalidateQueries({ queryKey: ["lead_events", id] });

  const save = useMutation({
    mutationFn: async (patch: AnyRow) => {
      setSaved("saving");
      const p = { ...patch };
      const advance = "stage_id" in p ? null : autoStageForOutreach(stages, leadQ.data?.stage_id, p);
      if (advance) p.stage_id = advance.id;
      const { error } = await supabase.from("leads").update(p as never).eq("id", id);
      if (error) throw error;
      if (advance) toast.success(`Stage moved to ${advance.name}`);
    },
    onSuccess: () => {
      flashSaved();
      invalidate();
    },
    onError: (e: any) => {
      setSaved(null);
      toast.error(e.message ?? "Save failed");
    },
  });

  // Ensure at least 2 contacts
  useEffect(() => {
    const l = leadQ.data;
    if (!l) return;
    const cs = l.lead_contacts ?? [];
    if (cs.length === 0 && canEdit)
      supabase
        .from("lead_contacts")
        .insert([
          { lead_id: id, order_index: 0, is_primary: true },
          { lead_id: id, order_index: 1, is_primary: false },
        ] as never)
        .then(({ error }) => {
          if (!error) invalidate();
        });
    else if (cs.length === 1 && canEdit)
      supabase
        .from("lead_contacts")
        .insert({ lead_id: id, order_index: 1, is_primary: false } as never)
        .then(({ error }) => {
          if (!error) invalidate();
        });
  }, [leadQ.data?.id, leadQ.data?.lead_contacts?.length, canEdit]);

  // Ensure at least 5 follow-ups
  useEffect(() => {
    const l = leadQ.data;
    if (!l || !canEdit) return;
    const fus: AnyRow[] = l.lead_followups ?? [];
    const rows: AnyRow[] = [];
    let seq = fus.length ? Math.max(...fus.map((f) => f.sequence_number)) : 0;
    for (let i = fus.length; i < 5; i++) {
      seq += 1;
      rows.push({ lead_id: id, sequence_number: seq });
    }
    if (rows.length > 0)
      supabase
        .from("lead_followups")
        .insert(rows as never)
        .then(({ error }) => {
          if (!error) invalidate();
        });
  }, [leadQ.data?.id, leadQ.data?.lead_followups?.length, canEdit]);

  // Keyboard shortcuts: j/k next/prev, e edit name, a archive, p push
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const ids = neighboursQ.data ?? [];
      const i = ids.indexOf(id);
      const k = e.key.toLowerCase();
      if (k === "j") {
        if (i >= 0 && i < ids.length - 1) navigate({ to: "/lt/leads/$id", params: { id: ids[i + 1] } });
      } else if (k === "k") {
        if (i > 0) navigate({ to: "/lt/leads/$id", params: { id: ids[i - 1] } });
      } else if (k === "e") {
        e.preventDefault();
        companyNameRef.current?.focus();
      } else if (k === "a") {
        if (leadQ.data) toggleArchive();
      } else if (k === "p") {
        if (leadQ.data) push.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [neighboursQ.data, id, leadQ.data]);

  const push = useMutation({
    mutationFn: async () => {
      if (
        leadQ.data?.reply_sentiment !== "positive" &&
        !window.confirm("This lead does not have a positive reply. Only positive replies normally go to the CRM. Push it anyway?")
      )
        return;
      const { error } = await (supabase.rpc as any)("ensure_crm_record", { _lead_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pushed to CRM");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to push to CRM"),
  });

  const toggleArchive = () => {
    const l = leadQ.data;
    if (l) save.mutate({ archived: !l.archived, archived_at: l.archived ? null : new Date().toISOString() });
  };

  const deleteLead = async () => {
    const l = leadQ.data;
    if (!l) return;
    const extra = l.pushed_to_crm ? "\n\nIts CRM record will be deleted too." : "";
    if (!window.confirm(`Delete "${l.company_name}" permanently? This cannot be undone.${extra}`)) return;
    const { data, error } = await supabase.from("leads").delete().eq("id", id).select("id");
    if (error) return toast.error(error.message ?? "Could not delete the lead");
    if (!data?.length) return toast.error("Only admins can delete leads.");
    toast.success("Lead deleted");
    qc.invalidateQueries({ queryKey: ["leads-table"] });
    qc.invalidateQueries({ queryKey: ["leads-board"] });
    qc.invalidateQueries({ queryKey: ["rapid-today"] });
    if (window.history.length > 1) window.history.back();
    else navigate({ to: "/lt/leads" });
  };

  // TODO(live parity): live AppPage takes heading={false} and guide="lead-page"; repo AppPage does not.
  if (id === "new" || isNew)
    return (
      <AppPage module="lead" title="New lead" perm="lead.leads">
        <Loading label="Creating lead" />
      </AppPage>
    );
  if (leadQ.isLoading)
    return (
      <AppPage module="lead" title="Lead" perm="lead.leads">
        <Loading />
      </AppPage>
    );
  const lead = leadQ.data;
  if (!lead)
    return (
      <AppPage module="lead" title="Lead" perm="lead.leads">
        <EmptyState
          title="Lead not found"
          hint="This lead may have been deleted or the link is incorrect."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/lt/leads">Back to leads</Link>
            </Button>
          }
        />
      </AppPage>
    );

  const contacts = [...(lead.lead_contacts ?? [])].sort((a: AnyRow, b: AnyRow) => a.order_index - b.order_index);
  const links = [...(lead.lead_links ?? [])].sort((a: AnyRow, b: AnyRow) => a.order_index - b.order_index);
  const followups: AnyRow[] = lead.lead_followups ?? [];
  const leadTagIds = new Set<string>((lead.lead_tags ?? []).map((t: AnyRow) => t.tag_id));
  const crmRecord = lead.crm_records;
  const onSave = (p: AnyRow) => save.mutate(p);
  const done = ({ error }: { error: any }) => (error ? toast.error(error.message) : invalidate());

  return (
    <AppPage module="lead" title={lead.company_name} perm="lead.leads" actions={<SavedIndicator saved={saved} />}>
      <LeadHeader
        lead={lead}
        stages={(stages ?? []) as AnyRow[]}
        canEdit={canEdit}
        onSave={onSave}
        onPush={() => push.mutate()}
        pushing={push.isPending}
        crmRecord={crmRecord}
        onToggleArchive={toggleArchive}
        onDelete={isAdmin ? deleteLead : undefined}
        companyNameRef={companyNameRef}
        channels={(channels ?? []) as AnyRow[]}
      />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[65%_35%]">
        <div className="flex flex-col gap-4">
          <CompanyCard
            lead={lead}
            countries={(countries ?? []) as AnyRow[]}
            channels={(channels ?? []) as AnyRow[]}
            senderAccounts={(senderAccounts ?? []) as AnyRow[]}
            links={links}
            canEdit={canEdit}
            onSave={onSave}
            invalidate={invalidate}
            leadId={id}
          />
          <PeopleCard
            contacts={contacts}
            canEdit={canEdit}
            onChange={(cid, p) => {
              supabase.from("lead_contacts").update(p as never).eq("id", cid).then(done);
            }}
            onAdd={() => {
              supabase
                .from("lead_contacts")
                .insert({ lead_id: id, order_index: contacts.length, is_primary: contacts.length === 0 } as never)
                .then(done);
            }}
            onRemove={(cid) => {
              supabase.from("lead_contacts").delete().eq("id", cid).then(done);
            }}
          />
          <LeadTasksCard leadId={id} canEdit={canEdit} />
          <NotesCard lead={lead} canEdit={canEdit} onSave={onSave} />
          <EmailCard lead={lead} canEdit={canEdit} onSave={onSave} />
          <LoomCard lead={lead} canEdit={canEdit} onSave={onSave} />
          <FollowupsCard
            followups={followups}
            channels={(channels ?? []) as AnyRow[]}
            canEdit={canEdit}
            leadId={id}
            lastContactedAt={lead.last_contacted_at}
            outreachAt={
              [lead.email_sent_at, lead.linkedin_sent_at, lead.instagram_sent_at, lead.linkedin_connection_sent_at]
                .filter(Boolean)
                .sort()[0] ?? null
            }
            defaultChannelId={lead.contacted_channel_id ?? lead.channel_id ?? null}
            lead={{ name: lead.primary_contact, company: lead.company_name }}
            pauseReason={followupPauseReason(lead, stages)}
            invalidate={invalidate}
            onChange={(fid, p) => {
              supabase.from("lead_followups").update(p as never).eq("id", fid).then(done);
            }}
            onAdd={() => {
              const seq = followups.length > 0 ? Math.max(...followups.map((f) => f.sequence_number)) + 1 : 1;
              supabase.from("lead_followups").insert({ lead_id: id, sequence_number: seq } as never).then(done);
            }}
          />
          <OutreachCard lead={lead} channels={(channels ?? []) as AnyRow[]} canEdit={canEdit} onSave={onSave} />
          <OutcomeCard lead={lead} canEdit={canEdit} onSave={onSave} leadId={id} crmRecord={crmRecord} />
          <TagsCard tags={(tags ?? []) as AnyRow[]} leadTagIds={leadTagIds} canEdit={canEdit} leadId={id} invalidate={invalidate} />
        </div>
        <div className="flex flex-col gap-4">
          <ActivityCard
            events={eventsQ.data ?? []}
            leadId={id}
            lead={lead}
            canEdit={isAdmin || can("lead.lead_edit")}
            onChanged={invalidateEvents}
            onLeadSave={onSave}
          />
          <PersonalizedMessageCard lead={lead} canEdit={canEdit} onSave={onSave} />
        </div>
      </div>
    </AppPage>
  );
}

function SavedIndicator({ saved }: { saved: null | "saving" | "saved" }) {
  if (!saved) return null;
  return <span className="text-[12px] text-muted-foreground">{saved === "saving" ? "Saving..." : "Saved"}</span>;
}

function LeadHeader({
  lead,
  stages,
  canEdit,
  onSave,
  onPush,
  pushing,
  crmRecord,
  onToggleArchive,
  onDelete,
  companyNameRef,
  channels,
}: {
  lead: AnyRow;
  stages: AnyRow[];
  canEdit: boolean;
  onSave: (p: AnyRow) => void;
  onPush: () => void;
  pushing: boolean;
  crmRecord: AnyRow | null;
  onToggleArchive: () => void;
  onDelete?: () => void;
  companyNameRef: RefObject<HTMLInputElement | null>;
  channels: AnyRow[];
}) {
  const [name, setName] = useState(lead.company_name ?? "");
  useEffect(() => setName(lead.company_name ?? ""), [lead.id]);
  const [pending, setPending] = useState<{ mode: GapMode; stageId: string | null } | null>(null);
  const gap = stageGap(lead, stages);
  const onStage = (sid: string) => {
    const s = stages.find((x) => x.id === sid);
    if (isReplyStage(s) && !hasReply(lead)) return setPending({ mode: "reply", stageId: sid });
    if (isContactStage(s) && !hasContact(lead)) return setPending({ mode: "contact", stageId: sid });
    onSave({ stage_id: sid });
  };
  const lastActivity =
    [
      lead.email_replied_at,
      lead.email_viewed_at,
      lead.email_sent_at,
      lead.loom_watched_at,
      lead.loom_sent_at,
      lead.linkedin_replied_at,
      lead.instagram_replied_at,
      lead.meeting_booked_at,
      lead.client_closed_at,
      lead.updated_at,
    ]
      .filter(Boolean)
      .sort()
      .pop() ?? lead.updated_at;

  return (
    <div className="pro-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-[300px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={companyNameRef}
              className="-ml-2 h-10 w-full min-w-0 max-w-[420px] border-transparent bg-transparent px-2 text-[22px] font-semibold tracking-tight shadow-none hover:bg-subtle focus-visible:bg-surface md:text-[22px]"
              value={name}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== lead.company_name && onSave({ company_name: name.trim() })}
            />
            <span className="font-mono text-[11.5px] text-faint">{lead.lead_code}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={lead.stage_id ?? undefined} disabled={!canEdit} onValueChange={onStage}>
              <SelectTrigger className="h-8 w-[150px] text-[13px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lead.status} disabled={!canEdit} onValueChange={(v) => onSave({ status: v })}>
              <SelectTrigger className="h-8 w-[150px] text-[13px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lead.priority ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ priority: v })}>
              <SelectTrigger className="h-8 w-[130px] text-[13px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StagePill stage={stages.find((s) => s.id === lead.stage_id) as any} />
            {lead.pushed_to_crm && crmRecord ? (
              <Link to="/crm/records/$id" params={{ id: crmRecord.id }}>
                <Pill tone="positive">
                  In CRM <ExternalLink className="ml-1 inline size-3" />
                </Pill>
              </Link>
            ) : (
              canEdit && (
                <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onPush} disabled={pushing}>
                  <Upload className="mr-1 size-3.5" /> Push to CRM
                </Button>
              )
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onToggleArchive}
                title={lead.archived ? "Restore" : "Archive"}
              >
                {lead.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="size-7" onClick={onDelete} title="Delete lead permanently">
                <Trash2 className="size-4 text-negative" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 text-[12px] text-muted-foreground sm:items-end">
          <div>Created {fmtDate(lead.created_at)}</div>
          <div>Last activity {fmtDate(lastActivity)}</div>
          <GapWarning gap={gap} canEdit={canEdit} onLog={() => gap && setPending({ mode: gap, stageId: null })} />
        </div>
        <ChannelPickDialog
          mode={pending?.mode ?? null}
          stageName={pending?.stageId ? stages.find((s) => s.id === pending.stageId)?.name : null}
          onClose={() => setPending(null)}
          onSkip={
            pending?.stageId
              ? () => {
                  onSave({ stage_id: pending.stageId });
                  setPending(null);
                }
              : undefined
          }
          onPick={(field) => {
            if (!pending) return;
            onSave({ ...(pending.stageId ? { stage_id: pending.stageId } : {}), ...gapPatch(pending.mode, field, channels ?? []) });
            setPending(null);
          }}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-text mb-1">{label}</div>
      {children}
    </div>
  );
}

function CompanyCard({
  lead,
  countries,
  channels,
  senderAccounts,
  links,
  canEdit,
  onSave,
  invalidate,
  leadId,
}: {
  lead: AnyRow;
  countries: AnyRow[];
  channels: AnyRow[];
  senderAccounts: AnyRow[];
  links: AnyRow[];
  canEdit: boolean;
  onSave: (p: AnyRow) => void;
  invalidate: () => void;
  leadId: string;
}) {
  const [website, setWebsite] = useState(lead.website_url ?? "");
  const [companyLinkedin, setCompanyLinkedin] = useState(lead.company_linkedin_url ?? "");
  const [instagram, setInstagram] = useState(lead.instagram_url ?? "");
  const [youtube, setYoutube] = useState(lead.youtube_url ?? "");
  useEffect(() => {
    setWebsite(lead.website_url ?? "");
    setCompanyLinkedin(lead.company_linkedin_url ?? "");
    setInstagram(lead.instagram_url ?? "");
    setYoutube(lead.youtube_url ?? "");
  }, [lead.id]);

  const urlBlur =
    (kind: "website" | "linkedin" | "instagram", value: string, set: (v: string) => void, field: string, dupKey: string) =>
    () => {
      const v = normalizeForChannel(kind, value);
      set(v);
      if (v !== (lead[field] ?? "")) {
        onSave({ [field]: v || null });
        if (v) void warnDuplicate({ [dupKey]: v }, leadId);
      }
    };

  return (
    <CollapsibleCard id="lead.company" title="Company">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Country">
          <Select value={lead.country_id ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ country_id: v })}>
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date added">
          <DatePicker
            className="w-full text-[13px]"
            disabled={!canEdit}
            value={toDateInput(lead.date_added) || undefined}
            onChange={(v: string) => {
              if (!v) return;
              const iso = new Date(v + "T12:00:00").toISOString();
              if (iso !== lead.date_added) onSave({ date_added: iso });
            }}
            placeholder="Date added"
          />
        </Field>
        <Field label="Channel">
          <Select
            value={lead.channel_id ?? undefined}
            disabled={!canEdit}
            onValueChange={(v) => {
              const sa = senderAccounts.find((s) => s.id === lead.sender_account_id);
              onSave({ channel_id: v, ...(sa && sa.channel_id !== v ? { sender_account_id: null } : {}) });
            }}
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
        </Field>
        <Field label="Sender account">
          <div title={lead.channel_id ? undefined : "Please select the lead channel first to see the sender account."}>
            <Select
              value={lead.sender_account_id ?? undefined}
              disabled={!canEdit || !lead.channel_id}
              onValueChange={(v) => onSave({ sender_account_id: v })}
            >
              <SelectTrigger className="h-8 text-[13px]">
                <SelectValue placeholder="Sender account" />
              </SelectTrigger>
              <SelectContent>
                {senderAccounts
                  .filter((s) => s.channel_id === lead.channel_id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {!lead.channel_id && (
              <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                Please select the lead channel first to see the sender account.
              </div>
            )}
          </div>
        </Field>
        <Field label="Website">
          <LinkInput
            className="h-8 text-[13px]"
            value={website}
            disabled={!canEdit}
            onChange={(e) => setWebsite(e.target.value)}
            onBlur={urlBlur("website", website, setWebsite, "website_url", "website")}
          />
        </Field>
        <Field label="Company LinkedIn">
          <LinkInput
            className="h-8 text-[13px]"
            value={companyLinkedin}
            disabled={!canEdit}
            onChange={(e) => setCompanyLinkedin(e.target.value)}
            onBlur={urlBlur("linkedin", companyLinkedin, setCompanyLinkedin, "company_linkedin_url", "linkedin")}
          />
        </Field>
        <Field label="Instagram">
          <LinkInput
            className="h-8 text-[13px]"
            value={instagram}
            disabled={!canEdit}
            onChange={(e) => setInstagram(e.target.value)}
            onBlur={urlBlur("instagram", instagram, setInstagram, "instagram_url", "instagram")}
          />
        </Field>
        <Field label="YouTube">
          <LinkInput
            className="h-8 text-[13px]"
            value={youtube}
            disabled={!canEdit}
            onChange={(e) => setYoutube(e.target.value)}
            onBlur={() => youtube !== (lead.youtube_url ?? "") && onSave({ youtube_url: youtube || null })}
          />
        </Field>
      </div>
      <div className="mt-4">
        <div className="label-text mb-2">Links</div>
        <div className="flex flex-col gap-2">
          {links.map((l) => (
            <LinkRow key={l.id} link={l} canEdit={canEdit} invalidate={invalidate} />
          ))}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                supabase
                  .from("lead_links")
                  .insert({ lead_id: leadId, order_index: links.length, label: "", url: "" } as never)
                  .then(({ error }) => (error ? toast.error(error.message) : invalidate()));
              }}
            >
              <Plus className="mr-1 size-3.5" /> Add link
            </Button>
          )}
        </div>
      </div>
    </CollapsibleCard>
  );
}

function LinkRow({ link, canEdit, invalidate }: { link: AnyRow; canEdit: boolean; invalidate: () => void }) {
  const [label, setLabel] = useState(link.label ?? "");
  const [url, setUrl] = useState(link.url ?? "");
  useEffect(() => {
    setLabel(link.label ?? "");
    setUrl(link.url ?? "");
  }, [link.id]);
  const update = (p: AnyRow) => {
    supabase
      .from("lead_links")
      .update(p as never)
      .eq("id", link.id)
      .then(({ error }) => (error ? toast.error(error.message) : invalidate()));
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Label"
        className="h-8 w-[160px] text-[13px]"
        value={label}
        disabled={!canEdit}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label !== (link.label ?? "") && update({ label: label || null })}
      />
      <LinkInput
        placeholder="URL"
        wrapperClassName="flex-1"
        className="h-8 text-[13px]"
        value={url}
        disabled={!canEdit}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== (link.url ?? "") && update({ url: url || null })}
      />
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => {
            supabase
              .from("lead_links")
              .delete()
              .eq("id", link.id)
              .then(({ error }) => (error ? toast.error(error.message) : invalidate()));
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function NotesCard({ lead, canEdit, onSave }: { lead: AnyRow; canEdit: boolean; onSave: (p: AnyRow) => void }) {
  const [research, setResearch] = useState(lead.research_notes ?? "");
  const [additional, setAdditional] = useState(lead.additional_notes ?? "");
  useEffect(() => {
    setResearch(lead.research_notes ?? "");
    setAdditional(lead.additional_notes ?? "");
  }, [lead.id]);
  return (
    <CollapsibleCard id="lead.notes" title="Research and notes">
      <div className="flex flex-col gap-4">
        <div>
          <div className="label-text mb-1">Research notes</div>
          <Textarea
            className="min-h-[100px] text-[13px]"
            value={research}
            disabled={!canEdit}
            onChange={(e) => setResearch(e.target.value)}
            onBlur={() => research !== (lead.research_notes ?? "") && onSave({ research_notes: research || null })}
          />
        </div>
        <div>
          <div className="label-text mb-1">Additional notes</div>
          <Textarea
            className="min-h-[100px] text-[13px]"
            value={additional}
            disabled={!canEdit}
            onChange={(e) => setAdditional(e.target.value)}
            onBlur={() => additional !== (lead.additional_notes ?? "") && onSave({ additional_notes: additional || null })}
          />
        </div>
      </div>
    </CollapsibleCard>
  );
}

function EmailCard({ lead, canEdit, onSave }: { lead: AnyRow; canEdit: boolean; onSave: (p: AnyRow) => void }) {
  const parts: string[] = [];
  if (lead.email_sent) parts.push(`Sent ${fmtDate(lead.email_sent_at)}`);
  if (lead.email_viewed) parts.push(`Viewed ${fmtDate(lead.email_viewed_at)}`);
  if (lead.email_replied) parts.push(`Replied ${fmtDate(lead.email_replied_at)}`);
  return (
    <CollapsibleCard id="lead.email" title="Email">
      <div className="flex flex-col gap-1">
        <CheckDate
          label="Email sent"
          checked={lead.email_sent}
          date={lead.email_sent_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ email_sent: c, email_sent_at: d })}
        />
        <CheckDate
          label="Email viewed"
          checked={lead.email_viewed}
          date={lead.email_viewed_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ email_viewed: c, email_viewed_at: d })}
        />
        <CheckDate
          label="Email replied"
          checked={lead.email_replied}
          date={lead.email_replied_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ email_replied: c, email_replied_at: d })}
        />
        <div className={lead.email_replied && !lead.reply_sentiment ? "rounded-md border border-warning p-2" : ""}>
          <div className="label-text mb-1">
            Reply sentiment {lead.email_replied && <span className="text-warning">(required)</span>}
          </div>
          <Select value={lead.reply_sentiment ?? undefined} disabled={!canEdit} onValueChange={(v) => onSave({ reply_sentiment: v })}>
            <SelectTrigger className="h-8 w-[180px] text-[13px]">
              <SelectValue placeholder="Sentiment" />
            </SelectTrigger>
            <SelectContent>
              {SENTIMENT_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {parts.length > 0 && <div className="mt-1 text-[12px] text-muted-foreground">{parts.join(" · ")}</div>}
        <div className="label-text mt-1">{MANUAL_HELPER}</div>
      </div>
    </CollapsibleCard>
  );
}

function LoomCard({ lead, canEdit, onSave }: { lead: AnyRow; canEdit: boolean; onSave: (p: AnyRow) => void }) {
  const [url, setUrl] = useState(lead.loom_url ?? "");
  const [pct, setPct] = useState(String(lead.loom_watch_percent ?? ""));
  useEffect(() => {
    setUrl(lead.loom_url ?? "");
    setPct(String(lead.loom_watch_percent ?? ""));
  }, [lead.id]);
  return (
    <CollapsibleCard id="lead.loom" title="Loom">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Loom URL"
            className="h-8 flex-1 text-[13px]"
            value={url}
            disabled={!canEdit}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => url !== (lead.loom_url ?? "") && onSave({ loom_url: url || null })}
          />
          {lead.loom_url && (
            <Button asChild variant="outline" size="sm" className="h-8">
              <a href={lead.loom_url} target="_blank" rel="noreferrer">
                Open
              </a>
            </Button>
          )}
        </div>
        <CheckDate
          label="Loom sent"
          checked={lead.loom_sent}
          date={lead.loom_sent_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ loom_sent: c, loom_sent_at: d })}
        />
        <CheckDate
          label="Loom watched"
          checked={lead.loom_watched}
          date={lead.loom_watched_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ loom_watched: c, loom_watched_at: d })}
        />
        <div className="w-[160px]">
          <div className="label-text mb-1">Watch %</div>
          <Input
            type="number"
            min={0}
            max={100}
            className="h-8 text-[13px]"
            value={pct}
            disabled={!canEdit}
            onChange={(e) => setPct(e.target.value)}
            onBlur={() => {
              const v = pct === "" ? null : Math.max(0, Math.min(100, Number(pct)));
              if (v !== lead.loom_watch_percent) onSave({ loom_watch_percent: v });
            }}
          />
        </div>
      </div>
    </CollapsibleCard>
  );
}

function ChannelMenu({
  channels,
  value,
  onSelect,
  disabled,
  title,
}: {
  channels: AnyRow[];
  value: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  title: string;
}) {
  const cur = channels.find((c) => c.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px] text-muted-foreground" title={title}>
          {cur?.name ?? "Channel"} <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSelect(null)}>None</DropdownMenuItem>
        {channels.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => onSelect(c.id)}>
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Medium = "email" | "message";
function MediumToggle({ value, onChange, disabled }: { value: Medium; onChange: (v: Medium) => void; disabled?: boolean }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border text-[12px]">
      <button
        type="button"
        disabled={disabled}
        className={cn("px-2 py-1", value === "email" ? "bg-accent font-medium" : "text-muted-foreground")}
        onClick={() => onChange("email")}
      >
        Email
      </button>
      <button
        type="button"
        disabled={disabled}
        className={cn("border-l border-border px-2 py-1", value === "message" ? "bg-accent font-medium" : "text-muted-foreground")}
        onClick={() => onChange("message")}
      >
        Message
      </button>
    </div>
  );
}

function OutreachCard({
  lead,
  channels,
  canEdit,
  onSave,
}: {
  lead: AnyRow;
  channels: AnyRow[];
  canEdit: boolean;
  onSave: (p: AnyRow) => void;
}) {
  const kindOf = (cid: string | null) =>
    channels.find((c) => c.id === cid)?.kind ??
    ((channels.find((c) => c.id === cid)?.name ?? "").toLowerCase().includes("instagram") ? "instagram" : undefined);
  const sentList = [
    { on: lead.email_sent, at: lead.email_sent_at, kind: "email" },
    { on: lead.linkedin_sent, at: lead.linkedin_sent_at, kind: "message" },
    { on: lead.instagram_sent, at: lead.instagram_sent_at, kind: "message" },
  ].filter((x) => x.on);
  const replyList = [
    { on: lead.email_replied, at: lead.email_replied_at, kind: "email" },
    { on: lead.linkedin_replied, at: lead.linkedin_replied_at, kind: "message" },
    { on: lead.instagram_replied, at: lead.instagram_replied_at, kind: "message" },
  ].filter((x) => x.on);
  const earliest = (l: AnyRow[]) => l.map((x) => x.at).filter(Boolean).sort()[0] ?? null;
  const sentDefault: Medium =
    kindOf(lead.contacted_channel_id) === "email" || (sentList[0]?.kind === "email" && sentList.length === 1) ? "email" : "message";
  const replyDefault: Medium =
    kindOf(lead.reply_channel_id) === "email" || (replyList[0]?.kind === "email" && replyList.length === 1) ? "email" : "message";
  const [sentMedium, setSentMedium] = useState<Medium>(sentDefault);
  const [replyMedium, setReplyMedium] = useState<Medium>(replyDefault);
  useEffect(() => setSentMedium(sentDefault), [lead.id, sentDefault]);
  useEffect(() => setReplyMedium(replyDefault), [lead.id, replyDefault]);
  const contacted = sentList.length > 0;
  const contactedAt = earliest(sentList);
  const replied = replyList.length > 0;
  const repliedAt = earliest(replyList);
  const msgKind = (cid: string | null) => (kindOf(cid) === "instagram" ? "instagram" : "linkedin");

  return (
    <CollapsibleCard id="lead.other_channels" title="Outreach">
      <div className="flex flex-col gap-1">
        <CheckDate
          label="LinkedIn connection request sent"
          checked={lead.linkedin_connection_sent}
          date={lead.linkedin_connection_sent_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ linkedin_connection_sent: c, linkedin_connection_sent_at: d })}
        />
        <CheckDate
          label="LinkedIn message sent"
          checked={lead.linkedin_sent}
          date={lead.linkedin_sent_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ linkedin_sent: c, linkedin_sent_at: d })}
        />
        <CheckDate
          label="LinkedIn replied"
          checked={lead.linkedin_replied}
          date={lead.linkedin_replied_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ linkedin_replied: c, linkedin_replied_at: d })}
        />
        <CheckDate
          label="Instagram sent"
          checked={lead.instagram_sent}
          date={lead.instagram_sent_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ instagram_sent: c, instagram_sent_at: d })}
        />
        <CheckDate
          label="Instagram replied"
          checked={lead.instagram_replied}
          date={lead.instagram_replied_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ instagram_replied: c, instagram_replied_at: d })}
        />
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-3 py-1">
            <CheckDate
              label="Contacted"
              checked={!!contacted}
              date={contactedAt}
              disabled={!canEdit}
              onChange={(c: boolean, d: string | null) => {
                if (c) {
                  if (sentMedium === "email") onSave({ email_sent: true, email_sent_at: d });
                  else if (msgKind(lead.contacted_channel_id) === "instagram") onSave({ instagram_sent: true, instagram_sent_at: d });
                  else onSave({ linkedin_sent: true, linkedin_sent_at: d });
                } else
                  onSave({
                    email_sent: false,
                    email_sent_at: null,
                    linkedin_sent: false,
                    linkedin_sent_at: null,
                    instagram_sent: false,
                    instagram_sent_at: null,
                  });
              }}
            />
            <MediumToggle value={sentMedium} onChange={setSentMedium} disabled={!canEdit} />
            <ChannelMenu
              title="Channel used to contact"
              channels={channels}
              value={lead.contacted_channel_id}
              disabled={!canEdit}
              onSelect={(v) => onSave({ contacted_channel_id: v })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 py-1">
            <CheckDate
              label="Replied"
              checked={!!replied}
              date={repliedAt}
              disabled={!canEdit}
              onChange={(c: boolean, d: string | null) => {
                if (c) {
                  if (replyMedium === "email") onSave({ email_replied: true, email_replied_at: d });
                  else if (msgKind(lead.reply_channel_id) === "instagram") onSave({ instagram_replied: true, instagram_replied_at: d });
                  else onSave({ linkedin_replied: true, linkedin_replied_at: d });
                } else
                  onSave({
                    email_replied: false,
                    email_replied_at: null,
                    linkedin_replied: false,
                    linkedin_replied_at: null,
                    instagram_replied: false,
                    instagram_replied_at: null,
                  });
              }}
            />
            <MediumToggle value={replyMedium} onChange={setReplyMedium} disabled={!canEdit} />
            <ChannelMenu
              title="Channel the reply came in on"
              channels={channels}
              value={lead.reply_channel_id}
              disabled={!canEdit}
              onSelect={(v) => onSave({ reply_channel_id: v })}
            />
          </div>
          <div className="label-text mt-1">{MANUAL_HELPER}</div>
        </div>
      </div>
    </CollapsibleCard>
  );
}

function OutcomeCard({
  lead,
  canEdit,
  onSave,
  leadId,
  crmRecord,
}: {
  lead: AnyRow;
  canEdit: boolean;
  onSave: (p: AnyRow) => void;
  leadId: string;
  crmRecord: AnyRow | null;
}) {
  return (
    <CollapsibleCard id="lead.outcome" title="Outcome">
      <div className="flex flex-col gap-1">
        <CheckDate
          label="Meeting booked"
          checked={lead.meeting_booked}
          date={lead.meeting_booked_at}
          disabled={!canEdit}
          onChange={(c: boolean, d: string | null) => onSave({ meeting_booked: c, meeting_booked_at: d })}
        />
        <CheckDate
          label="Client closed"
          checked={lead.client_closed}
          date={lead.client_closed_at}
          disabled={!canEdit}
          onChange={async (c: boolean, d: string | null) => {
            onSave({ client_closed: c, client_closed_at: d });
            if (!c) return;
            const v = window.prompt("Set deal value?");
            if (v === null || v.trim() === "") return;
            const n = Number(v);
            if (Number.isNaN(n)) return;
            const { error } = await (supabase.rpc as any)("ensure_crm_record", { _lead_id: leadId });
            if (error) {
              toast.error(error.message ?? "Failed to create CRM record");
              return;
            }
            const { data } = await supabase.from("crm_records").select("id").eq("lead_id", leadId).maybeSingle();
            const rid = (data as AnyRow | null)?.id ?? crmRecord?.id;
            if (rid) {
              const { error: e2 } = await supabase.from("crm_records").update({ estimated_value: n } as never).eq("id", rid);
              if (e2) toast.error(e2.message ?? "Failed to set deal value");
              else toast.success("Deal value set");
            }
          }}
        />
      </div>
    </CollapsibleCard>
  );
}

function TagsCard({
  tags,
  leadTagIds,
  canEdit,
  leadId,
  invalidate,
}: {
  tags: AnyRow[];
  leadTagIds: Set<string>;
  canEdit: boolean;
  leadId: string;
  invalidate: () => void;
}) {
  const toggle = (tagId: string, on: boolean) => {
    const done = ({ error }: { error: any }) => (error ? toast.error(error.message) : invalidate());
    if (on) supabase.from("lead_tags").delete().eq("lead_id", leadId).eq("tag_id", tagId).then(done);
    else supabase.from("lead_tags").insert({ lead_id: leadId, tag_id: tagId } as never).then(done);
  };
  return (
    <CollapsibleCard id="lead.tags" title="Tags">
      {tags.length === 0 ? (
        <EmptyState title="No tags yet" hint="Create tags in Settings to organize leads." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const on = leadTagIds.has(t.id);
            return (
              <button key={t.id} type="button" disabled={!canEdit} onClick={() => toggle(t.id, on)} className="disabled:opacity-60">
                <Pill tone={on ? "info" : "neutral"} color={on ? t.color : undefined}>
                  {t.name}
                </Pill>
              </button>
            );
          })}
        </div>
      )}
    </CollapsibleCard>
  );
}
