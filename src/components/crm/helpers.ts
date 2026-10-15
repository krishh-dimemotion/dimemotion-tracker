// Ported from live chunk helpers-Df4uC1e7.js.
import { money } from "@/components/live/kit";

export const PRIORITY_COLORS: Record<string, string> = {
  high: "#e5484d",
  medium: "#f5a623",
  low: "#8a8f98",
};

export const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const DEAL_TYPE_LABELS: Record<string, string> = {
  one_time: "One time",
  retainer: "Retainer",
  hybrid: "Hybrid",
};

export const DIRECTION_LABELS: Record<string, string> = {
  outbound: "Outbound",
  inbound: "Inbound",
};

export type CrmRecordRow = {
  id: string;
  lead_id: string;
  stage_id: string | null;
  priority: string;
  estimated_value: number | null;
  currency: string;
  deal_type: string;
  mrr_amount: number | null;
  contract_months: number | null;
  probability: number | null;
  last_contacted_at: string | null;
  next_followup_date: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  leads: {
    id: string;
    company_name: string;
    lead_code: string;
    primary_contact: string | null;
    sender_account_id?: string | null;
    contacted_channel_id?: string | null;
    sender_accounts?: { label: string; identifier: string | null } | null;
    channels?: { name: string } | null;
    lead_contacts?: { email: string | null; linkedin_url: string | null; is_primary: boolean }[];
  } | null;
};

export function senderLabel(r: CrmRecordRow) {
  const leads = r.leads as CrmRecordRow["leads"];
  const account = leads?.sender_accounts;
  const channel = leads?.channels;
  if (!account && !channel) return "-";
  const parts: string[] = [];
  if (account) parts.push(account.identifier ? `${account.label} (${account.identifier})` : account.label);
  if (channel) parts.push(channel.name);
  return parts.join(" · ") || "-";
}

/** One-line value summary, e.g. "$5,000 + $1,000/mo x 6". */
export function dealValueLabel(r: {
  currency?: string | null;
  estimated_value: number | null;
  contract_months: number | null;
  mrr_amount: number | null;
  deal_type: string | null;
}) {
  const cur = r.currency ?? "USD";
  const base = money(r.estimated_value, cur);
  const months = r.contract_months && r.contract_months > 0 ? ` x ${r.contract_months}` : "";
  const mrr = r.mrr_amount ? `${money(r.mrr_amount, cur)}/mo${months}` : "";
  if (r.deal_type === "hybrid") return mrr ? `${base} + ${mrr}` : base;
  return (r.deal_type === "retainer" && mrr) || base;
}
