// Live chunk: duplicate-detector-Cv78E1JS.js
// Export mapping:
//   n -> findDuplicateLead     t -> DUPLICATE_MATCH_LABELS
import { db } from "./db";
import {
  normalizeCompanyName,
  normalizeEmail,
  normalizeInstagram,
  normalizeLinkedIn,
  normalizeWebsite,
} from "./config";

const LEAD_COLS = "id, company_name, lead_code, archived";
const LIMIT = 25;

export type DuplicateMatchKind = "instagram" | "linkedin" | "email" | "website" | "name";
export type DuplicateMatch = {
  leadId: string;
  companyName: string | null;
  matchedOn: DuplicateMatchKind;
  leadCode: string | null;
  archived: boolean;
};

type LeadRow = { id: string; company_name: string | null; lead_code: string | null; archived: boolean | null };

function escapeLike(v: string) {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function toMatch(lead: LeadRow, on: DuplicateMatchKind): DuplicateMatch {
  return {
    leadId: lead.id,
    companyName: lead.company_name,
    matchedOn: on,
    leadCode: lead.lead_code,
    archived: !!lead.archived,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function byInstagram(value: string, excludeId?: string) {
  const ig = normalizeInstagram(value);
  if (!ig) return null;
  const pattern = `%instagram.com/${escapeLike(ig.handle)}%`;
  const same = (v: string | null) => normalizeInstagram(v ?? "")?.handle === ig.handle;
  const [leads, contacts] = await Promise.all([
    db.from("leads").select(`${LEAD_COLS}, instagram_url`).ilike("instagram_url", pattern).limit(LIMIT),
    db
      .from("lead_contacts")
      .select(`lead_id, instagram_url, leads(${LEAD_COLS})`)
      .ilike("instagram_url", pattern)
      .limit(LIMIT),
  ]);
  const l = ((leads.data ?? []) as any[]).find((r) => r.id !== excludeId && same(r.instagram_url));
  if (l) return toMatch(l, "instagram");
  const c = ((contacts.data ?? []) as any[]).find(
    (r) => r.leads && r.lead_id !== excludeId && same(r.instagram_url),
  );
  return c?.leads ? toMatch(c.leads, "instagram") : null;
}

async function byLinkedIn(value: string, excludeId?: string) {
  const li = normalizeLinkedIn(value);
  if (!li) return null;
  const pattern = `%linkedin.com/${li.kind === "person" ? "in" : "company"}/${escapeLike(li.slug)}%`;
  const same = (v: string | null) => {
    const n = normalizeLinkedIn(v ?? "");
    return n?.kind === li.kind && n.slug === li.slug;
  };
  const [leads, contacts] = await Promise.all([
    db
      .from("leads")
      .select(`${LEAD_COLS}, company_linkedin_url`)
      .ilike("company_linkedin_url", pattern)
      .limit(LIMIT),
    db
      .from("lead_contacts")
      .select(`lead_id, linkedin_url, leads(${LEAD_COLS})`)
      .ilike("linkedin_url", pattern)
      .limit(LIMIT),
  ]);
  const l = ((leads.data ?? []) as any[]).find((r) => r.id !== excludeId && same(r.company_linkedin_url));
  if (l) return toMatch(l, "linkedin");
  const c = ((contacts.data ?? []) as any[]).find(
    (r) => r.leads && r.lead_id !== excludeId && same(r.linkedin_url),
  );
  return c?.leads ? toMatch(c.leads, "linkedin") : null;
}

async function byEmail(value: string, excludeId?: string) {
  const email = normalizeEmail(value);
  if (!email) return null;
  const pattern = escapeLike(email);
  const same = (v: string | null) => normalizeEmail(v ?? "")?.toLowerCase() === email.toLowerCase();
  const [contacts, leads] = await Promise.all([
    db.from("lead_contacts").select(`lead_id, email, leads(${LEAD_COLS})`).ilike("email", pattern).limit(LIMIT),
    db.from("leads").select(`${LEAD_COLS}, primary_contact`).ilike("primary_contact", pattern).limit(LIMIT),
  ]);
  const c = ((contacts.data ?? []) as any[]).find((r) => r.leads && r.lead_id !== excludeId && same(r.email));
  if (c?.leads) return toMatch(c.leads, "email");
  const l = ((leads.data ?? []) as any[]).find((r) => r.id !== excludeId && same(r.primary_contact));
  return l ? toMatch(l, "email") : null;
}

async function byWebsite(value: string, excludeId?: string) {
  const w = normalizeWebsite(value);
  if (!w) return null;
  const { data } = await db
    .from("leads")
    .select(`${LEAD_COLS}, website_url`)
    .ilike("website_url", `%${escapeLike(w.domain)}%`)
    .limit(LIMIT);
  const l = ((data ?? []) as any[]).find(
    (r) => r.id !== excludeId && normalizeWebsite(r.website_url ?? "")?.domain === w.domain,
  );
  return l ? toMatch(l, "website") : null;
}

async function byName(value: string, excludeId?: string) {
  const name = normalizeCompanyName(value);
  if (name.length < 3) return null;
  const first = name.split(" ")[0];
  const { data } = await db
    .from("leads")
    .select(LEAD_COLS)
    .ilike("company_name", `%${escapeLike(first)}%`)
    .limit(50);
  const l = ((data ?? []) as any[]).find(
    (r) => r.id !== excludeId && normalizeCompanyName(r.company_name) === name,
  );
  return l ? toMatch(l, "name") : null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function findDuplicateLead(
  input: {
    email?: string | null;
    instagram?: string | null;
    linkedin?: string | null;
    website?: string | null;
    companyName?: string | null;
  },
  opts: { excludeLeadId?: string; matchName?: boolean } = {},
): Promise<DuplicateMatch | null> {
  const ex = opts.excludeLeadId;
  const safe = (p: Promise<DuplicateMatch | null>) =>
    p.catch((e) => (console.error("Duplicate check failed", e), null));
  const results = await Promise.all([
    input.email ? safe(byEmail(input.email, ex)) : null,
    input.instagram ? safe(byInstagram(input.instagram, ex)) : null,
    input.linkedin ? safe(byLinkedIn(input.linkedin, ex)) : null,
    input.website ? safe(byWebsite(input.website, ex)) : null,
    opts.matchName && input.companyName ? safe(byName(input.companyName, ex)) : null,
  ]);
  return results.find((r) => !!r) ?? null;
}

export const DUPLICATE_MATCH_LABELS: Record<DuplicateMatchKind, string> = {
  instagram: "same Instagram",
  linkedin: "same LinkedIn",
  email: "same email",
  website: "same website",
  name: "same company name",
};

export { DUPLICATE_MATCH_LABELS as MATCH_LABELS };
