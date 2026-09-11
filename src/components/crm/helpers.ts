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
  } | null;
};
