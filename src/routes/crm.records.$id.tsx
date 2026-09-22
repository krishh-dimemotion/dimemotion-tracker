import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { CollapsibleCard, Loading, Pill } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useChannels, useProfiles, useStages } from "@/hooks/useLookups";
import { fmtDate, fmtDateTime, money, toDateInput } from "@/lib/format";
import { DEAL_TYPE_LABELS, DIRECTION_LABELS } from "@/components/crm/helpers";
import { LeadTasksCard } from "@/components/tasks/tasks";

export const Route = createFileRoute("/crm/records/$id")({
  head: () => ({
    meta: [
      { title: "Record — CRM — Buzzspear Tracker" },
      { name: "description", content: "CRM record detail: stage, contacts, dates, contact log." },
      { property: "og:title", content: "Record — CRM — Buzzspear Tracker" },
      { property: "og:description", content: "CRM record detail: stage, contacts, dates, contact log." },
    ],
  }),
  component: RecordDetailPage,
});

function useSaveIndicator() {
  const [saved, setSaved] = useState<null | "saving" | "saved">(null);
  const flashSaved = () => {
    setSaved("saved");
    setTimeout(() => setSaved(null), 1500);
  };
  return { saved, setSaved, flashSaved };
}

function RecordDetailPage() {
  const { id } = useParams({ from: "/crm/records/$id" });
  const { can } = useAuth();
  const canEdit = can("crm.record_edit");
  const qc = useQueryClient();
  const { data: stages } = useStages("crm");
  const { data: profiles } = useProfiles();
  const { data: channels } = useChannels();

  const recordQuery = useQuery({
    queryKey: ["crm_record", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_records")
        .select(
          "*, leads(*, lead_contacts(*), lead_links(*), countries(name,flag_emoji), stages(name,color), sender_accounts(label,identifier), contacted:channels!leads_contacted_channel_id_fkey(name), reply:channels!leads_reply_channel_id_fkey(name))",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });


  const record = recordQuery.data as any;
  const lead = record?.leads;

  const { saved, setSaved, flashSaved } = useSaveIndicator();

  const updateRecord = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      setSaved("saving");
      const { error } = await supabase.from("crm_records").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      flashSaved();
      qc.invalidateQueries({ queryKey: ["crm_record", id] });
    },
    onError: (e: any) => {
      setSaved(null);
      toast.error(e.message ?? "Save failed");
    },
  });

  if (recordQuery.isLoading) {
    return (
      <AppPage module="crm" title="Record" perm="crm.records">
        <Loading />
      </AppPage>
    );
  }

  if (!record) {
    return (
      <AppPage module="crm" title="Record" perm="crm.records">
        <div className="text-[13px] text-muted-foreground">Record not found.</div>
      </AppPage>
    );
  }

  return (
    <AppPage module="crm" title={lead?.company_name ?? "Record"} perm="crm.records" actions={<SavedIndicator saved={saved} />}>
      <div className="flex flex-col gap-4">
        {lead && <LeadSummaryCard lead={lead} />}
        <HeaderCard record={record} stages={stages ?? []} canEdit={canEdit} onSave={(p) => updateRecord.mutate(p)} />
        <ContactsCard leadId={lead?.id} contacts={lead?.lead_contacts ?? []} canEdit={canEdit} recordId={id} />
        {lead && <LeadOutreachCard lead={lead} />}
        {lead && <LeadTasksCard leadId={lead.id} canEdit={canEdit} cardId="crm.todos.card" />}
        <DatesCard record={record} canEdit={canEdit} onSave={(p) => updateRecord.mutate(p)} />
        <CollapsibleCard id="crm.notes" title="Notes">
          <Textarea
            defaultValue={record.notes ?? ""}
            disabled={!canEdit}
            placeholder="Internal notes about this deal"
            className="min-h-[120px] text-[13px]"
            onBlur={(e) => {
              if (e.target.value !== (record.notes ?? "")) updateRecord.mutate({ notes: e.target.value });
            }}
          />
        </CollapsibleCard>
        {lead && (
          <CollapsibleCard id="crm.lead-notes" title="Lead research and notes" defaultOpen={false}>
            <div className="flex flex-col gap-3 text-[13px] whitespace-pre-wrap">
              <div>
                <div className="label-text mb-1">Research</div>
                <div className="text-muted-foreground">{lead.research_notes || "Nothing recorded."}</div>
              </div>
              <div>
                <div className="label-text mb-1">Additional notes</div>
                <div className="text-muted-foreground">{lead.additional_notes || "Nothing recorded."}</div>
              </div>
            </div>
          </CollapsibleCard>
        )}
      </div>
    </AppPage>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label-text mb-0.5">{label}</div>
      <div className="text-[13px]">{value || <span className="text-muted-foreground">-</span>}</div>
    </div>
  );
}

function LinkOut({ href, label }: { href?: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[12px] underline underline-offset-2"
    >
      {label} <ExternalLink className="size-3" />
    </a>
  );
}

function LeadSummaryCard({ lead }: { lead: any }) {
  const sender = lead.sender_accounts;
  return (
    <CollapsibleCard
      id="crm.lead-summary"
      title="Lead"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/lt/leads/$id" params={{ id: lead.id }} target="_blank">
            Open in Lead Tracker <ExternalLink className="ml-1 size-3.5" />
          </Link>
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Company" value={lead.company_name} />
        <Field label="Lead code" value={lead.lead_code} />
        <Field
          label="Country"
          value={lead.countries ? `${lead.countries.flag_emoji ?? ""} ${lead.countries.name}`.trim() : ""}
        />
        <Field label="Lead stage" value={lead.stages ? <Pill color={lead.stages.color}>{lead.stages.name}</Pill> : ""} />
        <Field label="Primary contact" value={lead.primary_contact} />
        <Field label="Reply sentiment" value={lead.reply_sentiment} />
        <Field label="Contacted via" value={lead.contacted?.name} />
        <Field label="Reply came in on" value={lead.reply?.name} />
        <Field
          label="Sent from"
          value={sender ? (sender.identifier ? `${sender.label} (${sender.identifier})` : sender.label) : ""}
        />
        <Field label="Date added" value={fmtDate(lead.date_added)} />
        <Field label="Last contacted" value={fmtDateTime(lead.last_contacted_at)} />
        <Field label="Next follow-up" value={fmtDate(lead.next_followup_date)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <LinkOut href={lead.website_url} label="Website" />
        <LinkOut href={lead.company_linkedin_url} label="LinkedIn" />
        <LinkOut href={lead.instagram_url} label="Instagram" />
        <LinkOut href={lead.youtube_url} label="YouTube" />
        <LinkOut href={lead.loom_url} label="Loom" />
        {(lead.lead_links ?? []).map((l: any) => (
          <LinkOut key={l.id} href={l.url} label={l.label || "Link"} />
        ))}
      </div>
    </CollapsibleCard>
  );
}

function LeadOutreachCard({ lead }: { lead: any }) {
  const rows: { label: string; done: boolean; at: string | null }[] = [
    { label: "Email sent", done: lead.email_sent, at: lead.email_sent_at },
    { label: "Email viewed", done: lead.email_viewed, at: lead.email_viewed_at },
    { label: "Email replied", done: lead.email_replied, at: lead.email_replied_at },
    { label: "LinkedIn connection sent", done: lead.linkedin_connection_sent, at: lead.linkedin_connection_sent_at },
    { label: "LinkedIn message sent", done: lead.linkedin_sent, at: lead.linkedin_sent_at },
    { label: "LinkedIn replied", done: lead.linkedin_replied, at: lead.linkedin_replied_at },
    { label: "Instagram sent", done: lead.instagram_sent, at: lead.instagram_sent_at },
    { label: "Instagram replied", done: lead.instagram_replied, at: lead.instagram_replied_at },
    { label: "Loom sent", done: lead.loom_sent, at: lead.loom_sent_at },
    { label: "Loom watched", done: lead.loom_watched, at: lead.loom_watched_at },
    { label: "Meeting booked", done: lead.meeting_booked, at: lead.meeting_booked_at },
    { label: "Client closed", done: lead.client_closed, at: lead.client_closed_at },
  ];
  return (
    <CollapsibleCard id="crm.lead-outreach" title="Outreach so far" defaultOpen={false}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5">
            <span className={r.done ? "text-[13px]" : "text-[13px] text-muted-foreground"}>{r.label}</span>
            <span className="text-[11px] text-muted-foreground">{r.done ? fmtDate(r.at) || "Yes" : "No"}</span>
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}

function SavedIndicator({ saved }: { saved: null | "saving" | "saved" }) {
  if (!saved) return null;
  return (
    <span className="text-[12px] text-muted-foreground">{saved === "saving" ? "Saving..." : "Saved"}</span>
  );
}

function HeaderCard({
  record,
  stages,
  canEdit,
  onSave,
}: {
  record: any;
  stages: any[];
  canEdit: boolean;
  onSave: (p: Record<string, any>) => void;
}) {
  const [value, setValue] = useState(String(record.estimated_value ?? ""));
  const [currency, setCurrency] = useState(record.currency ?? "USD");
  const [mrr, setMrr] = useState(String(record.mrr_amount ?? ""));
  const [months, setMonths] = useState(String(record.contract_months ?? ""));

  useEffect(() => {
    setValue(String(record.estimated_value ?? ""));
    setCurrency(record.currency ?? "USD");
    setMrr(String(record.mrr_amount ?? ""));
    setMonths(String(record.contract_months ?? ""));
  }, [record.id]);

  return (
    <CollapsibleCard id="crm.header" title="Deal">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="label-text mb-1">Stage</div>
          <Select
            value={record.stage_id ?? undefined}
            disabled={!canEdit}
            onValueChange={(v) => {
              const stage = stages.find((s) => s.id === v);
              onSave({ stage_id: v, probability: stage?.default_probability ?? record.probability });
            }}
          >
            <SelectTrigger className="h-8 text-[13px]">
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
        </div>
        <div>
          <div className="label-text mb-1">Priority</div>
          <Select value={record.priority} disabled={!canEdit} onValueChange={(v) => onSave({ priority: v })}>
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="label-text mb-1">Deal type</div>
          <Select
            value={record.deal_type}
            disabled={!canEdit}
            onValueChange={(v) => onSave({ deal_type: v })}
          >
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Deal type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_time">One time</SelectItem>
              <SelectItem value="retainer">Retainer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="label-text mb-1">Estimated value</div>
          <div className="flex gap-2">
            <Input
              type="number"
              className="h-8 text-[13px]"
              value={value}
              disabled={!canEdit}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => onSave({ estimated_value: value ? Number(value) : null })}
            />
            <Input
              className="h-8 w-[80px] text-[13px]"
              value={currency}
              disabled={!canEdit}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              onBlur={() => onSave({ currency })}
            />
          </div>
        </div>
        {record.deal_type === "retainer" && (
          <>
            <div>
              <div className="label-text mb-1">Monthly amount (MRR)</div>
              <Input
                type="number"
                className="h-8 text-[13px]"
                value={mrr}
                disabled={!canEdit}
                onChange={(e) => setMrr(e.target.value)}
                onBlur={() => onSave({ mrr_amount: mrr ? Number(mrr) : null })}
              />
            </div>
            <div>
              <div className="label-text mb-1">Contract length (months)</div>
              <Input
                type="number"
                className="h-8 text-[13px]"
                value={months}
                disabled={!canEdit}
                onChange={(e) => setMonths(e.target.value)}
                onBlur={() => onSave({ contract_months: months ? Number(months) : null })}
              />
            </div>
          </>
        )}
      </div>
      <div className="mt-3 text-[12px] text-muted-foreground">
        {money(record.estimated_value, record.currency)}
        {record.deal_type === "retainer" && record.mrr_amount ? ` • ${money(record.mrr_amount, record.currency)}/mo` : ""}
      </div>
    </CollapsibleCard>
  );
}

function ContactsCard({
  leadId,
  contacts,
  canEdit,
  recordId,
}: {
  leadId: string;
  contacts: any[];
  canEdit: boolean;
  recordId: string;
}) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm_record", recordId] });

  const updateContact = useMutation({
    mutationFn: async ({ contactId, patch }: { contactId: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("lead_contacts").update(patch as never).eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const addContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lead_contacts").insert({
        lead_id: leadId,
        order_index: contacts.length,
        is_primary: contacts.length === 0,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Failed to add contact"),
  });

  const removeContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from("lead_contacts").delete().eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Failed to remove contact"),
  });

  const rows = contacts.length >= 3 ? contacts : [...contacts, ...Array(3 - contacts.length).fill(null)];

  return (
    <CollapsibleCard
      id="crm.contacts"
      title="Contacts"
      actions={saved ? <span className="text-[12px] text-muted-foreground">Saved</span> : undefined}
    >
      <div className="flex flex-col gap-3">
        {rows.map((c, i) =>
          c ? (
            <ContactRow
              key={c.id}
              contact={c}
              canEdit={canEdit}
              onChange={(patch) => updateContact.mutate({ contactId: c.id, patch })}
              onRemove={() => removeContact.mutate(c.id)}
            />
          ) : (
            <div key={`empty-${i}`} className="rounded-md border border-dashed border-border p-3 text-[12px] text-muted-foreground">
              Empty contact slot
            </div>
          ),
        )}
        {canEdit && (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => addContact.mutate()}>
            <Plus className="mr-1 size-3.5" /> Add another contact
          </Button>
        )}
      </div>
    </CollapsibleCard>
  );
}

function ContactRow({
  contact,
  canEdit,
  onChange,
  onRemove,
}: {
  contact: any;
  canEdit: boolean;
  onChange: (patch: Record<string, any>) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(contact.person_name ?? "");
  const [title, setTitle] = useState(contact.job_title ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [linkedin, setLinkedin] = useState(contact.linkedin_url ?? "");

  useEffect(() => {
    setName(contact.person_name ?? "");
    setTitle(contact.job_title ?? "");
    setEmail(contact.email ?? "");
    setLinkedin(contact.linkedin_url ?? "");
  }, [contact.id]);

  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        placeholder="Name"
        className="h-8 text-[13px]"
        value={name}
        disabled={!canEdit}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== contact.person_name && onChange({ person_name: name })}
      />
      <Input
        placeholder="Job title"
        className="h-8 text-[13px]"
        value={title}
        disabled={!canEdit}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== contact.job_title && onChange({ job_title: title })}
      />
      <Input
        placeholder="Email"
        className="h-8 text-[13px]"
        value={email}
        disabled={!canEdit}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={() => email !== contact.email && onChange({ email })}
      />
      <Input
        placeholder="LinkedIn URL"
        className="h-8 text-[13px]"
        value={linkedin}
        disabled={!canEdit}
        onChange={(e) => setLinkedin(e.target.value)}
        onBlur={() => linkedin !== contact.linkedin_url && onChange({ linkedin_url: linkedin })}
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={!!contact.is_primary}
            disabled={!canEdit}
            onChange={(e) => onChange({ is_primary: e.target.checked })}
          />
          Primary
        </label>
        {canEdit && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DatesCard({
  record,
  canEdit,
  onSave,
}: {
  record: any;
  canEdit: boolean;
  onSave: (p: Record<string, any>) => void;
}) {
  const fields: { key: string; label: string }[] = [
    { key: "last_contacted_at", label: "Last contacted" },
    { key: "expected_close_date", label: "Expected close date" },
    { key: "next_followup_date", label: "Next follow-up date" },
    { key: "closed_at", label: "Closed date" },
  ];
  return (
    <CollapsibleCard id="crm.dates" title="Dates">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((f) => (
          <div key={f.key}>
            <div className="label-text mb-1">{f.label}</div>
            <Input
              type="date"
              className="h-8 text-[13px]"
              disabled={!canEdit}
              defaultValue={toDateInput(record[f.key])}
              onBlur={(e) => {
                const v = e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null;
                if (v !== record[f.key]) onSave({ [f.key]: v });
              }}
            />
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}

function ContactLogCard({
  recordId,
  logs,
  channels,
  canEdit,
}: {
  recordId: string;
  logs: any[];
  channels: any[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [channelId, setChannelId] = useState<string>("");
  const [direction, setDirection] = useState("outbound");
  const [summary, setSummary] = useState("");

  const logMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_contact_log").insert({
        crm_record_id: recordId,
        contacted_at: new Date(date + "T12:00:00").toISOString(),
        channel_id: channelId || null,
        direction,
        summary: summary || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact logged");
      setOpen(false);
      setSummary("");
      qc.invalidateQueries({ queryKey: ["crm_contact_log", recordId] });
      qc.invalidateQueries({ queryKey: ["crm_record", recordId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to log contact"),
  });

  return (
    <CollapsibleCard
      id="crm.contact-log"
      title="Contact log"
      actions={
        canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                Log contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log contact</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div>
                  <div className="label-text mb-1">Date</div>
                  <Input type="date" className="h-8 text-[13px]" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <div className="label-text mb-1">Channel</div>
                  <Select value={channelId} onValueChange={setChannelId}>
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="label-text mb-1">Direction</div>
                  <Select value={direction} onValueChange={setDirection}>
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Outbound</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="label-text mb-1">Summary</div>
                  <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="text-[13px]" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => logMutation.mutate()} disabled={logMutation.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      }
    >
      {logs.length === 0 ? (
        <div className="text-[13px] text-muted-foreground">No contact logged yet.</div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {logs.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
              <div>
                <span className="font-medium">{fmtDateTime(l.contacted_at)}</span>
                <span className="ml-2 text-muted-foreground">
                  {l.channels?.name ?? "-"} • {DIRECTION_LABELS[l.direction] ?? l.direction}
                </span>
                {l.summary && <div className="text-muted-foreground">{l.summary}</div>}
              </div>
              <div className="shrink-0 text-[11px] text-muted-foreground">
                {l.profiles?.full_name || l.profiles?.email}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
