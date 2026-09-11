export const LEAD_FIELD_DEFS = [
  { key: "company_name", label: "Company name" },
  { key: "primary_contact", label: "Primary contact" },
  { key: "country", label: "Country" },
  { key: "stage", label: "Stage" },
  { key: "channel", label: "Channel" },
  { key: "sender_account", label: "Sender account" },
  { key: "date_added", label: "Date added" },
  { key: "website_url", label: "Website URL" },
  { key: "company_linkedin_url", label: "Company LinkedIn URL" },
  { key: "instagram_url", label: "Instagram URL" },
  { key: "youtube_url", label: "YouTube URL" },
  { key: "person_1_name", label: "Person 1 name" },
  { key: "person_1_email", label: "Person 1 email" },
  { key: "person_1_linkedin", label: "Person 1 LinkedIn" },
  { key: "person_2_name", label: "Person 2 name" },
  { key: "person_2_email", label: "Person 2 email" },
  { key: "person_2_linkedin", label: "Person 2 LinkedIn" },
  { key: "research_notes", label: "Research notes" },
  { key: "additional_notes", label: "Additional notes" },
  { key: "tags", label: "Tags" },
  { key: "next_followup_date", label: "Next follow-up date" },
] as const;

export type LeadFieldKey = (typeof LEAD_FIELD_DEFS)[number]["key"];

export const TEMPLATE_HEADER = LEAD_FIELD_DEFS.map((f) => f.key).join(",");

export function autoMatchField(header: string): LeadFieldKey | "ignore" {
  const norm = header.trim().toLowerCase().replace(/\s+/g, "_");
  const found = LEAD_FIELD_DEFS.find((f) => f.key === norm);
  return found ? found.key : "ignore";
}
