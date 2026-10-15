// Ported from live chunk crm.records._id-C0gWut25.js.
import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Plus, ReceiptText, Trash2 } from "lucide-react";
import { AppPage } from "@/components/app-shell";
import { CollapsibleCard, DatePicker, Loading, Pill, fmtDate, fmtDateTime, money, toDateInput } from "@/components/live/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { useChannels, useProfiles, useStages } from "@/hooks/useLookups";
import { LeadTasksCard } from "@/components/tasks/tasks";
import { CopyButton, LinkInput, VerifyToggle } from "@/components/crm/copy-button";
import { dealTotal } from "@/components/crm/earnings";
import { DIRECTION_LABELS, dealValueLabel } from "@/components/crm/helpers";
import { useReportCurrency } from "@/components/crm/report-currency";
import { useInvoices } from "@/components/crm/invoice-types";

const META_TITLE = "Record | CRM | Tracker";
const META_DESC = "CRM record detail: stage, contacts, dates, contact log.";

export const Route = createFileRoute("/crm/records/$id")({
  head: () => ({
    meta: [
      { title: META_TITLE },
      { name: "description", content: META_DESC },
      { property: "og:title", content: META_TITLE },
      { property: "og:description", content: META_DESC },
    ],
  }),
  component: CrmRecordPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Patch = Record<string, any>;

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

function CrmRecordPage() {
  const { id } = useParams({ from: "/crm/records/$id" });
  const { can } = useAuth();
  const canEdit = can("crm.record_edit");
  const qc = useQueryClient();
  const { data: stages } = useStages("crm");
  useProfiles();
  const { data: channels } = useChannels();

  const recordQ = useQuery({
    queryKey: ["crm_record", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crm_records")
        .select(
          "*, leads(*, lead_contacts(*), lead_links(*), countries(name,flag_emoji), stages(name,color), sender_accounts(label,identifier), contacted:channels!leads_contacted_channel_id_fkey(name), reply:channels!leads_reply_channel_id_fkey(name))",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const logQ = useQuery({
    queryKey: ["crm_contact_log", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crm_contact_log")
        .select("*, channels(name), profiles!crm_contact_log_created_by_fkey(full_name,email)")
        .eq("crm_record_id", id)
        .order("contacted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const record = recordQ.data;
  const lead = record?.leads;
  const { saved, setSaved, flashSaved } = useSavedFlash();
  const save = useMutation({
    mutationFn: async (patch: Patch) => {
      setSaved("saving");
      const { error } = await (supabase as any).from("crm_records").update(patch).eq("id", id);
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

  const pageProps = { heading: false, guide: "crm-records", module: "crm" as const, perm: "crm.records" } as any;

  if (recordQ.isLoading)
    return (
      <AppPage {...pageProps} title="Record">
        <Loading />
      </AppPage>
    );
  if (!record)
    return (
      <AppPage {...pageProps} title="Record">
        <div className="text-[13px] text-muted-foreground">Record not found.</div>
      </AppPage>
    );

  return (
    <AppPage {...pageProps} title={lead?.company_name ?? "Record"} actions={<SavedIndicator saved={saved} />}>
      <div className="flex flex-col gap-4">
        {lead && <LeadSummary lead={lead} />}
        <DealCard
          record={record}
          stages={(stages ?? []) as any[]}
          canEdit={canEdit}
          onSave={(p) => save.mutate(p)}
          companyName={lead?.company_name}
        />
        <ContactsCard leadId={lead?.id} contacts={lead?.lead_contacts ?? []} canEdit={canEdit} recordId={id} />
        {lead && <OutreachCard lead={lead} />}
        {lead && <LeadTasksCard leadId={lead.id} canEdit={canEdit} cardId="crm.todos.card" />}
        <DatesCard record={record} canEdit={canEdit} onSave={(p) => save.mutate(p)} />
        <ContactLogCard recordId={id} logs={logQ.data ?? []} channels={(channels ?? []) as any[]} canEdit={canEdit} />
        <CollapsibleCard id="crm.notes" title="Notes">
          <Textarea
            defaultValue={record.notes ?? ""}
            disabled={!canEdit}
            placeholder="Internal notes about this deal"
            className="min-h-[120px] text-[13px]"
            onBlur={(e) => {
              if (e.target.value !== (record.notes ?? "")) save.mutate({ notes: e.target.value });
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

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="label-text mb-0.5">{label}</div>
      <div className="text-[13px]">{value || <span className="text-muted-foreground">-</span>}</div>
    </div>
  );
}

function ExtLink({ href, label }: { href?: string | null; label: string }) {
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

function LeadSummary({ lead }: { lead: any }) {
  const acct = lead.sender_accounts;
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
        <Field
          label="Lead stage"
          value={lead.stages ? <Pill color={lead.stages.color}>{lead.stages.name}</Pill> : ""}
        />
        <Field label="Primary contact" value={lead.primary_contact} />
        <Field label="Reply sentiment" value={lead.reply_sentiment} />
        <Field label="Contacted via" value={lead.contacted?.name} />
        <Field label="Reply came in on" value={lead.reply?.name} />
        <Field label="Sent from" value={acct ? (acct.identifier ? `${acct.label} (${acct.identifier})` : acct.label) : ""} />
        <Field label="Date added" value={fmtDate(lead.date_added)} />
        <Field label="Last contacted" value={fmtDateTime(lead.last_contacted_at)} />
        <Field label="Next follow-up" value={fmtDate(lead.next_followup_date)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <ExtLink href={lead.website_url} label="Website" />
        <ExtLink href={lead.company_linkedin_url} label="LinkedIn" />
        <ExtLink href={lead.instagram_url} label="Instagram" />
        <ExtLink href={lead.youtube_url} label="YouTube" />
        <ExtLink href={lead.loom_url} label="Loom" />
        {(lead.lead_links ?? []).map((l: any) => (
          <ExtLink key={l.id} href={l.url} label={l.label || "Link"} />
        ))}
      </div>
    </CollapsibleCard>
  );
}

function OutreachCard({ lead: l }: { lead: any }) {
  const steps = [
    { label: "Email sent", done: l.email_sent, at: l.email_sent_at },
    { label: "Email viewed", done: l.email_viewed, at: l.email_viewed_at },
    { label: "Email replied", done: l.email_replied, at: l.email_replied_at },
    { label: "LinkedIn connection sent", done: l.linkedin_connection_sent, at: l.linkedin_connection_sent_at },
    { label: "LinkedIn message sent", done: l.linkedin_sent, at: l.linkedin_sent_at },
    { label: "LinkedIn replied", done: l.linkedin_replied, at: l.linkedin_replied_at },
    { label: "Instagram sent", done: l.instagram_sent, at: l.instagram_sent_at },
    { label: "Instagram replied", done: l.instagram_replied, at: l.instagram_replied_at },
    { label: "Loom sent", done: l.loom_sent, at: l.loom_sent_at },
    { label: "Loom watched", done: l.loom_watched, at: l.loom_watched_at },
    { label: "Meeting booked", done: l.meeting_booked, at: l.meeting_booked_at },
    { label: "Client closed", done: l.client_closed, at: l.client_closed_at },
  ];
  return (
    <CollapsibleCard id="crm.lead-outreach" title="Outreach so far" defaultOpen={false}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5">
            <span className={s.done ? "text-[13px]" : "text-[13px] text-muted-foreground"}>{s.label}</span>
            <span className="text-[11px] text-muted-foreground">{s.done ? fmtDate(s.at) || "Yes" : "No"}</span>
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}

function SavedIndicator({ saved }: { saved: null | "saving" | "saved" }) {
  if (!saved) return null;
  return <span className="text-[12px] text-muted-foreground">{saved === "saving" ? "Saving..." : "Saved"}</span>;
}

function contractTotal(r: any) {
  const mrr = Number(r.mrr_amount ?? 0);
  const value = Number(r.estimated_value ?? 0);
  if (r.deal_type === "hybrid") return value + mrr * (r.contract_months > 0 ? Number(r.contract_months) : 12);
  if (r.deal_type === "retainer")
    return mrr * (r.contract_months > 0 ? Number(r.contract_months) : value > 0 && mrr > 0 ? Math.round(value / mrr) : 12);
  return Number(r.estimated_value ?? 0);
}

function DealCard({
  record: r,
  stages,
  canEdit,
  onSave,
  companyName,
}: {
  record: any;
  stages: any[];
  canEdit: boolean;
  onSave: (p: Patch) => void;
  companyName?: string;
}) {
  const { data: invoices = [] } = useInvoices();
  const dealInvoices = (invoices as any[]).filter((inv) => {
    const invRec = inv.crmRecordId == null ? "" : String(inv.crmRecordId);
    const recId = r.id == null ? "" : String(r.id);
    const invLead = inv.leadId == null ? "" : String(inv.leadId);
    const recLead = r.lead_id == null ? "" : String(r.lead_id);
    return (invRec !== "" && invRec === recId) || (invLead !== "" && recLead !== "" && invLead === recLead);
  });
  const [value, setValue] = useState(String(r.estimated_value ?? ""));
  const [currency, setCurrency] = useState(r.currency ?? "USD");
  const [mrr, setMrr] = useState(String(r.mrr_amount ?? ""));
  const [months, setMonths] = useState(String(r.contract_months ?? ""));
  useEffect(() => {
    setValue(String(r.estimated_value ?? ""));
    setCurrency(r.currency ?? "USD");
    setMrr(String(r.mrr_amount ?? ""));
    setMonths(String(r.contract_months ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id]);

  const isWon = !!stages.find((s) => s.id === r.stage_id)?.is_won;
  const fx = useReportCurrency();
  const code = fx.code;
  const dealCur = (r.currency ?? "USD").trim().toUpperCase() || "USD";
  const manualInCode = r.usd_value_manual && (r.received_currency ?? "USD").toUpperCase() === code;
  const [received, setReceived] = useState(manualInCode ? String(r.received_amount ?? "") : "");
  useEffect(() => {
    setReceived(manualInCode ? String(r.received_amount ?? "") : "");
  }, [r.id, manualInCode, r.received_amount]);

  const fmtRate = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const recurringPatch = (m: string, c: string) => {
    const p: Patch = { mrr_amount: m ? Number(m) : null, contract_months: c ? Number(c) : null };
    if (r.deal_type === "retainer") p.estimated_value = m ? Number(m) * (c ? Number(c) : 12) : null;
    return p;
  };
  const recurring = r.deal_type === "retainer" || r.deal_type === "hybrid";

  return (
    <CollapsibleCard id="crm.header" title="Deal">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="label-text mb-1">Stage</div>
          <Select
            value={r.stage_id ?? undefined}
            disabled={!canEdit}
            onValueChange={(v) =>
              onSave({ stage_id: v, probability: stages.find((s) => s.id === v)?.default_probability ?? r.probability })
            }
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
          <Select value={r.priority} disabled={!canEdit} onValueChange={(v) => onSave({ priority: v })}>
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
            value={r.deal_type}
            disabled={!canEdit}
            onValueChange={(v) =>
              onSave(
                v === "retainer" && r.mrr_amount
                  ? { deal_type: v, estimated_value: Number(r.mrr_amount) * (r.contract_months || 12) }
                  : { deal_type: v },
              )
            }
          >
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Deal type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_time">One time</SelectItem>
              <SelectItem value="retainer">Retainer (monthly)</SelectItem>
              <SelectItem value="hybrid">Hybrid (fee + monthly)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {r.deal_type !== "retainer" && (
          <div>
            <div className="label-text mb-1">{r.deal_type === "hybrid" ? "One-time fee" : "Deal value"}</div>
            <Input
              type="number"
              className="h-8 text-[13px]"
              value={value}
              disabled={!canEdit}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => onSave({ estimated_value: value ? Number(value) : null })}
            />
          </div>
        )}
        <div>
          <div className="label-text mb-1">Currency</div>
          <Input
            className="h-8 w-[90px] text-[13px]"
            value={currency}
            maxLength={3}
            disabled={!canEdit}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            onBlur={() => currency !== r.currency && onSave({ currency })}
          />
        </div>
        {recurring && (
          <>
            <div>
              <div className="label-text mb-1">Monthly amount</div>
              <Input
                type="number"
                className="h-8 text-[13px]"
                value={mrr}
                disabled={!canEdit}
                onChange={(e) => setMrr(e.target.value)}
                onBlur={() => onSave(recurringPatch(mrr, months))}
              />
            </div>
            <div>
              <div className="label-text mb-1">Contract length (months)</div>
              <Input
                type="number"
                className="h-8 text-[13px]"
                placeholder="Blank = ongoing (counted as 12)"
                value={months}
                disabled={!canEdit}
                onChange={(e) => setMonths(e.target.value)}
                onBlur={() => onSave(recurringPatch(mrr, months))}
              />
            </div>
          </>
        )}
      </div>
      <div className="mt-3 text-[12px] text-muted-foreground">
        {dealValueLabel(r)}
        {recurring && r.mrr_amount ? ` = ${money(contractTotal(r), r.currency)} in total` : ""}
      </div>
      {isWon && dealCur !== code && (
        <div className="mt-3 space-y-3 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div>
            <span className="font-medium">Exchange rate locked at close.</span> Closed on {fmtDate(r.closed_at)}
            {dealCur !== "USD" && r.usd_rate_at_close ? ` at 1 USD = ${fmtRate(Number(r.usd_rate_at_close))} ${dealCur}` : ""}.{" "}
            Your CRM totals in {code} always use the rate from that day, not today's. If you change the value or monthly
            amount now, it is converted at the same closing rate.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="label-text mb-1">
                {r.deal_type === "hybrid"
                  ? `One-time fee received (${code})`
                  : r.deal_type === "retainer"
                    ? `Total received (${code})`
                    : `Amount received (${code})`}
              </div>
              <Input
                type="number"
                className="h-8 w-[160px] bg-background text-[13px]"
                placeholder={String(Math.round(fx.value(r) * 100) / 100)}
                value={received}
                disabled={!canEdit}
                onChange={(e) => setReceived(e.target.value)}
                onBlur={() => {
                  if (received === "") {
                    if (r.usd_value_manual) onSave({ usd_value_manual: false });
                    return;
                  }
                  if (!manualInCode || Number(received) !== Number(r.received_amount))
                    onSave({ usd_value_manual: true, received_amount: Number(received), received_currency: code });
                }}
              />
            </div>
            {r.usd_value_manual && canEdit && (
              <Button variant="outline" size="sm" className="h-8" onClick={() => onSave({ usd_value_manual: false })}>
                Use closing rate instead
              </Button>
            )}
            <div className="pb-1.5">
              Counted in revenue as <span className="font-medium">{fx.fmt(dealTotal(r, fx as any))}</span>
              {r.usd_value_manual ? " (amount you entered)" : " (converted at the closing rate)"}.
            </div>
          </div>
          <div className="text-amber-800/80 dark:text-amber-200/70">
            Optional: type exactly what reached your account in {code}, and that amount is used instead.
          </div>
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[12px]">
            <ReceiptText className="size-4 text-muted-foreground" />
            <span className="font-medium">Deal Invoices</span>
            {dealInvoices.length > 0 && (
              <span className="rounded-full bg-subtle border px-2 py-0.5 text-[10px] font-semibold">
                {dealInvoices.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-7 text-[11px] gap-1">
              <Link to="/crm/invoices">
                View All Invoices <ExternalLink className="size-3" />
              </Link>
            </Button>
            <Button asChild size="sm" className="h-7 text-[11px] gap-1">
              <Link
                to="/crm/invoices"
                search={
                  {
                    newForDeal: "1",
                    dealId: r.id,
                    leadId: r.lead_id || undefined,
                    dealValue: r.estimated_value || undefined,
                    currency: r.currency || "USD",
                    clientName: companyName || undefined,
                  } as any
                }
              >
                <Plus className="size-3" /> New Invoice for this Deal
              </Link>
            </Button>
          </div>
        </div>
        {dealInvoices.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-subtle/40 overflow-hidden text-xs">
            {dealInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-2.5 hover:bg-subtle/80 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-foreground">{inv.invoiceNumber}</span>
                  <span className="text-muted-foreground text-[11px]">{inv.issueDate}</span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      inv.status === "paid"
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : inv.status === "overdue"
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-foreground">
                    {inv.currency} {inv.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <Button asChild variant="ghost" size="sm" className="h-6 text-[11px] px-2">
                    <Link to="/crm/invoices">Manage</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">
            No invoices attached to this deal yet. Click "New Invoice for this Deal" to generate a branded invoice
            pre-filled with this deal's value and client details.
          </p>
        )}
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
  leadId?: string;
  contacts: any[];
  canEdit: boolean;
  recordId: string;
}) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm_record", recordId] });
  const update = useMutation({
    mutationFn: async ({ contactId, patch }: { contactId: string; patch: Patch }) => {
      const { error } = await (supabase as any).from("lead_contacts").update(patch).eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
      refresh();
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("lead_contacts")
        .insert({ lead_id: leadId, order_index: contacts.length, is_primary: contacts.length === 0 });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message ?? "Failed to add contact"),
  });
  const remove = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await (supabase as any).from("lead_contacts").delete().eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message ?? "Failed to remove contact"),
  });
  const slots: (any | null)[] =
    contacts.length >= 3 ? contacts : [...contacts, ...Array(3 - contacts.length).fill(null)];
  return (
    <CollapsibleCard
      id="crm.contacts"
      title="Contacts"
      actions={saved ? <span className="text-[12px] text-muted-foreground">Saved</span> : undefined}
    >
      <div className="flex flex-col gap-3">
        {slots.map((c, i) =>
          c ? (
            <ContactRow
              key={c.id}
              contact={c}
              canEdit={canEdit}
              onChange={(patch) => update.mutate({ contactId: c.id, patch })}
              onRemove={() => remove.mutate(c.id)}
            />
          ) : (
            <div
              key={`empty-${i}`}
              className="rounded-md border border-dashed border-border p-3 text-[12px] text-muted-foreground"
            >
              Empty contact slot
            </div>
          ),
        )}
        {canEdit && (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => add.mutate()}>
            <Plus className="mr-1 size-3.5" /> Add another contact
          </Button>
        )}
      </div>
    </CollapsibleCard>
  );
}

function ContactRow({
  contact: c,
  canEdit,
  onChange,
  onRemove,
}: {
  contact: any;
  canEdit: boolean;
  onChange: (p: Patch) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(c.person_name ?? "");
  const [title, setTitle] = useState(c.job_title ?? "");
  const [email, setEmail] = useState(c.email ?? "");
  const [linkedin, setLinkedin] = useState(c.linkedin_url ?? "");
  useEffect(() => {
    setName(c.person_name ?? "");
    setTitle(c.job_title ?? "");
    setEmail(c.email ?? "");
    setLinkedin(c.linkedin_url ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id]);
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/80 p-3 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        placeholder="Name"
        className="h-8 text-[13px]"
        value={name}
        disabled={!canEdit}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== c.person_name && onChange({ person_name: name })}
      />
      <Input
        placeholder="Job title"
        className="h-8 text-[13px]"
        value={title}
        disabled={!canEdit}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== c.job_title && onChange({ job_title: title })}
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
          onBlur={() => email !== c.email && onChange({ email, ...(c.email_verified ? { email_verified: false } : {}) })}
        />
        <CopyButton text={email} />
        {(email.trim() || c.email_verified) && (
          <VerifyToggle
            verified={!!c.email_verified}
            disabled={!canEdit}
            onToggle={(v) => onChange({ email_verified: v, ...(email === c.email ? {} : { email }) })}
          />
        )}
      </div>
      <LinkInput
        placeholder="LinkedIn URL"
        className="h-8 text-[13px]"
        value={linkedin}
        disabled={!canEdit}
        onChange={(e) => setLinkedin(e.target.value)}
        onBlur={() => linkedin !== c.linkedin_url && onChange({ linkedin_url: linkedin })}
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={!!c.is_primary}
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

const DATE_FIELDS = [
  { key: "last_contacted_at", label: "Last contacted" },
  { key: "expected_close_date", label: "Expected close date" },
  { key: "next_followup_date", label: "Next follow-up date" },
  { key: "closed_at", label: "Closed date" },
] as const;

function DatesCard({ record: r, canEdit, onSave }: { record: any; canEdit: boolean; onSave: (p: Patch) => void }) {
  return (
    <CollapsibleCard id="crm.dates" title="Dates">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {DATE_FIELDS.map((f) => (
          <div key={f.key}>
            <div className="label-text mb-1">{f.label}</div>
            <DatePicker
              className="h-8 text-[13px] w-full"
              disabled={!canEdit}
              value={toDateInput(r[f.key]) || undefined}
              onChange={(v: string | null) => {
                const iso = v ? new Date(v + "T12:00:00").toISOString() : null;
                if (iso !== r[f.key]) onSave({ [f.key]: iso });
              }}
              placeholder="Pick date"
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
  const [channelId, setChannelId] = useState("");
  const [direction, setDirection] = useState("outbound");
  const [summary, setSummary] = useState("");
  const log = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("crm_contact_log").insert({
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
                  <DatePicker
                    className="w-full text-[13px]"
                    value={date}
                    onChange={(v: string | null) => setDate(v || "")}
                    placeholder="Contact date"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Channel</div>
                  <Select value={channelId} onValueChange={setChannelId}>
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.name}
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
                <Button onClick={() => log.mutate()} disabled={log.isPending}>
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
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
              <div>
                <span className="font-medium">{fmtDateTime(l.contacted_at)}</span>
                <span className="ml-2 text-muted-foreground">
                  {l.channels?.name ?? "-"} • {DIRECTION_LABELS[l.direction] ?? l.direction}
                </span>
                {l.summary && <div className="text-muted-foreground">{l.summary}</div>}
              </div>
              <div className="shrink-0 text-[11px] text-muted-foreground">{l.profiles?.full_name || l.profiles?.email}</div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
