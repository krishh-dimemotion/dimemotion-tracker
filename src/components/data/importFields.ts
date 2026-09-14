export type FieldType =
  | "text"
  | "bool"
  | "date"
  | "percent"
  | "list"
  | "sentiment"
  | "email_status"
  | "lookup";

export type FieldGroup =
  | "Company"
  | "Links"
  | "People"
  | "Email"
  | "Loom"
  | "LinkedIn"
  | "Instagram"
  | "Outcomes"
  | "Follow-ups"
  | "Notes";

export type FieldDef = {
  key: string;
  label: string;
  group: FieldGroup;
  type: FieldType;
  /** Extra header spellings that should match this field. */
  synonyms: string[];
};

const PERSON_COUNT = 8;
const FUP_COUNT = 8;

const BASE_FIELDS: FieldDef[] = [
  // Company
  { key: "company_name", label: "Company name", group: "Company", type: "text", synonyms: ["company", "business", "brand", "account", "organisation", "organization", "client", "company/brand", "prospect", "prospect company", "name"] },
  { key: "primary_contact", label: "Primary contact", group: "Company", type: "text", synonyms: ["contact", "contact name", "poc", "point of contact", "decision maker", "owner name"] },
  { key: "country", label: "Country", group: "Company", type: "lookup", synonyms: ["location", "region", "geo", "market"] },
  { key: "stage", label: "Stage", group: "Company", type: "lookup", synonyms: ["pipeline stage", "lead stage", "deal stage"] },
  { key: "status", label: "Status", group: "Company", type: "text", synonyms: ["lead status"] },
  { key: "priority", label: "Priority", group: "Company", type: "text", synonyms: ["importance"] },
  { key: "channel", label: "Channel", group: "Company", type: "lookup", synonyms: ["outreach channel", "source", "platform"] },
  { key: "sender_account", label: "Sender account", group: "Company", type: "lookup", synonyms: ["sending account", "inbox", "from account", "sender", "sent from", "email account", "mailbox"] },
  { key: "date_added", label: "Date added", group: "Company", type: "date", synonyms: ["added", "created", "date", "date created", "added on", "scraped on"] },
  { key: "last_contacted_at", label: "Last contacted", group: "Company", type: "date", synonyms: ["last contact", "last touch", "last outreach"] },
  { key: "next_followup_date", label: "Next follow-up date", group: "Company", type: "date", synonyms: ["next followup", "next follow up", "follow up date", "next action date"] },
  { key: "tags", label: "Tags", group: "Company", type: "list", synonyms: ["labels", "categories", "niche", "industry", "segment"] },

  // Links
  { key: "website_url", label: "Website URL", group: "Links", type: "text", synonyms: ["website", "site", "web", "url", "domain", "homepage"] },
  { key: "company_linkedin_url", label: "Company LinkedIn URL", group: "Links", type: "text", synonyms: ["company linkedin", "business linkedin", "linkedin company", "company li"] },
  { key: "instagram_url", label: "Instagram URL", group: "Links", type: "text", synonyms: ["instagram", "ig", "insta", "ig link", "instagram link", "ig profile"] },
  { key: "youtube_url", label: "YouTube URL", group: "Links", type: "text", synonyms: ["youtube", "yt", "youtube channel", "yt link"] },
  { key: "extra_links", label: "Other links", group: "Links", type: "list", synonyms: ["links", "other link", "additional links", "resources"] },

  // Email
  { key: "email_status", label: "Email status (Sent / +Reply / -Reply)", group: "Email", type: "email_status", synonyms: ["email status", "status of email", "outreach status", "email outcome", "email result"] },
  { key: "email_sent", label: "Email sent", group: "Email", type: "bool", synonyms: ["sent", "mail sent", "email sent?", "cold email sent", "initial email sent"] },
  { key: "email_sent_at", label: "Email sent date", group: "Email", type: "date", synonyms: ["initial contact date", "first contact date", "email sent on", "date sent", "date emailed", "contact date", "outreach date"] },
  { key: "email_viewed", label: "Email viewed", group: "Email", type: "bool", synonyms: ["email viewed?", "opened", "email opened", "open", "viewed", "seen"] },
  { key: "email_viewed_at", label: "Email viewed date", group: "Email", type: "date", synonyms: ["opened on", "viewed on", "open date"] },
  { key: "email_replied", label: "Email replied", group: "Email", type: "bool", synonyms: ["replied", "reply", "response", "responded", "got reply"] },
  { key: "email_replied_at", label: "Email replied date", group: "Email", type: "date", synonyms: ["reply date", "replied on", "response date"] },
  { key: "reply_sentiment", label: "Reply sentiment", group: "Email", type: "sentiment", synonyms: ["sentiment", "reply type", "positive/negative", "response type"] },

  // Loom
  { key: "loom_url", label: "Loom link", group: "Loom", type: "text", synonyms: ["loom links", "loom", "loom url", "video link", "loom video"] },
  { key: "loom_sent", label: "Loom sent", group: "Loom", type: "bool", synonyms: ["loom sent?", "loom sent yes/no", "video sent", "sent loom"] },
  { key: "loom_sent_at", label: "Loom sent date", group: "Loom", type: "date", synonyms: ["loom sent on", "loom date", "video sent date"] },
  { key: "loom_watched", label: "Loom watched", group: "Loom", type: "bool", synonyms: ["loom watched?", "watched", "video watched", "loom viewed"] },
  { key: "loom_watched_at", label: "Loom watched date", group: "Loom", type: "date", synonyms: ["loom watched on", "watched on"] },
  { key: "loom_watch_percent", label: "Loom watch %", group: "Loom", type: "percent", synonyms: ["loom watch percent", "watch %", "watch percent", "loom watch % type 0 100", "percent watched"] },

  // LinkedIn
  { key: "linkedin_connection_sent", label: "LinkedIn connection request sent", group: "LinkedIn", type: "bool", synonyms: ["connection request", "li connect", "linkedin connect", "connection sent", "linkedin request", "invite sent"] },
  { key: "linkedin_connection_sent_at", label: "LinkedIn connection sent date", group: "LinkedIn", type: "date", synonyms: ["connection request date", "linkedin connect date"] },
  { key: "linkedin_sent", label: "LinkedIn message sent", group: "LinkedIn", type: "bool", synonyms: ["linkedin omni", "linkedin dm", "li dm", "linkedin message", "linkedin outreach", "li message sent", "linkedin sent"] },
  { key: "linkedin_sent_at", label: "LinkedIn message sent date", group: "LinkedIn", type: "date", synonyms: ["linkedin sent on", "linkedin message date"] },
  { key: "linkedin_replied", label: "LinkedIn replied", group: "LinkedIn", type: "bool", synonyms: ["linkedin reply", "li reply", "linkedin response"] },
  { key: "linkedin_replied_at", label: "LinkedIn replied date", group: "LinkedIn", type: "date", synonyms: ["linkedin reply date"] },

  // Instagram
  { key: "instagram_sent", label: "Instagram message sent", group: "Instagram", type: "bool", synonyms: ["ig omni", "ig dm", "instagram dm", "instagram message", "ig message sent", "instagram outreach", "instagram sent"] },
  { key: "instagram_sent_at", label: "Instagram message sent date", group: "Instagram", type: "date", synonyms: ["ig sent date", "instagram sent on"] },
  { key: "instagram_replied", label: "Instagram replied", group: "Instagram", type: "bool", synonyms: ["ig reply", "instagram reply", "ig response"] },
  { key: "instagram_replied_at", label: "Instagram replied date", group: "Instagram", type: "date", synonyms: ["ig reply date"] },

  // Outcomes
  { key: "meeting_booked", label: "Meeting booked", group: "Outcomes", type: "bool", synonyms: ["meeting booked?", "call booked", "dc set", "discovery call", "meeting", "booked", "appointment"] },
  { key: "meeting_booked_at", label: "Meeting booked date", group: "Outcomes", type: "date", synonyms: ["meeting date", "call date", "booked on"] },
  { key: "client_closed", label: "Client closed", group: "Outcomes", type: "bool", synonyms: ["closed", "won", "client won", "deal closed"] },
  { key: "client_closed_at", label: "Client closed date", group: "Outcomes", type: "date", synonyms: ["closed on", "close date", "won date"] },

  // Notes
  { key: "research_notes", label: "Research notes", group: "Notes", type: "text", synonyms: ["notes", "research", "comments", "remarks", "observations"] },
  { key: "additional_notes", label: "Additional notes", group: "Notes", type: "text", synonyms: ["extra notes", "other notes", "misc"] },
];

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function personFields(): FieldDef[] {
  const out: FieldDef[] = [];
  for (let n = 1; n <= PERSON_COUNT; n++) {
    out.push({
      key: `person_${n}_name`,
      label: `Person ${n} name`,
      group: "People",
      type: "text",
      synonyms: [`contact ${n} name`, `prospect ${n} name`, `person ${n}`, `name ${n}`, `first name ${n}`],
    });
    out.push({
      key: `person_${n}_title`,
      label: `Person ${n} job title`,
      group: "People",
      type: "text",
      synonyms: [`title ${n}`, `role ${n}`, `position ${n}`, `job title ${n}`],
    });
    out.push({
      key: `person_${n}_email`,
      label: `Person ${n} email`,
      group: "People",
      type: "text",
      synonyms: [`prospect email ${n}`, `email ${n}`, `contact email ${n}`, `email address ${n}`, `mail ${n}`],
    });
    out.push({
      key: `person_${n}_linkedin`,
      label: `Person ${n} LinkedIn`,
      group: "People",
      type: "text",
      synonyms: [`personal linkedin ${n}`, `linkedin ${n}`, `prospect linkedin ${n}`, `li ${n}`],
    });
    out.push({
      key: `person_${n}_instagram`,
      label: `Person ${n} Instagram`,
      group: "People",
      type: "text",
      synonyms: [`personal instagram ${n}`, `instagram ${n}`, `ig ${n}`],
    });
    out.push({
      key: `person_${n}_phone`,
      label: `Person ${n} phone`,
      group: "People",
      type: "text",
      synonyms: [`phone ${n}`, `mobile ${n}`, `number ${n}`, `contact number ${n}`],
    });
  }
  return out;
}

function followupFields(): FieldDef[] {
  const out: FieldDef[] = [];
  for (let n = 1; n <= FUP_COUNT; n++) {
    const ord = ORDINALS[n - 1] ?? `${n}th`;
    out.push({
      key: `fup_${n}_status`,
      label: `Follow-up ${n} status`,
      group: "Follow-ups",
      type: "text",
      synonyms: [`fup ${n} status`, `fup ${n}`, `follow up ${n} status`, `followup ${n}`, `${ord} fup status`],
    });
    out.push({
      key: `fup_${n}_date`,
      label: `Follow-up ${n} date`,
      group: "Follow-ups",
      type: "date",
      synonyms: [
        `fup ${n} date`,
        `${ord} fup date`,
        `${ord} follow up date`,
        `follow up ${n} date`,
        `${ord}`,
      ],
    });
  }
  return out;
}

export const LEAD_FIELD_DEFS: FieldDef[] = [...BASE_FIELDS, ...personFields(), ...followupFields()];

export const FIELD_BY_KEY = new Map(LEAD_FIELD_DEFS.map((f) => [f.key, f]));

export const FIELD_GROUPS: FieldGroup[] = [
  "Company",
  "Links",
  "People",
  "Email",
  "Loom",
  "LinkedIn",
  "Instagram",
  "Outcomes",
  "Follow-ups",
  "Notes",
];

export type LeadFieldKey = string;

export const TEMPLATE_HEADER = [
  "company_name",
  "primary_contact",
  "country",
  "stage",
  "channel",
  "sender_account",
  "date_added",
  "website_url",
  "company_linkedin_url",
  "instagram_url",
  "youtube_url",
  "person_1_name",
  "person_1_email",
  "person_1_linkedin",
  "person_2_name",
  "person_2_email",
  "person_2_linkedin",
  "email_status",
  "email_sent_at",
  "email_viewed",
  "loom_url",
  "loom_sent",
  "loom_watched",
  "loom_watch_percent",
  "linkedin_sent",
  "instagram_sent",
  "meeting_booked",
  "research_notes",
  "additional_notes",
  "tags",
  "next_followup_date",
].join(",");

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export function normalizeHeader(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, " ")
    .replace(/[_\-/\\]+/g, " ")
    .replace(/[^a-z0-9%+ ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const ORDINAL_WORDS: Record<string, number> = {
  "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3, "4th": 4, fourth: 4,
  "5th": 5, fifth: 5, "6th": 6, sixth: 6, "7th": 7, seventh: 7, "8th": 8, eighth: 8,
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((cur[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared++;
  });
  const overlap = shared / Math.max(ta.size, tb.size);
  const dist = levenshtein(a, b);
  const lev = 1 - dist / Math.max(a.length, b.length);
  return Math.max(overlap * 0.75 + lev * 0.25, lev * 0.9, overlap * 0.95);
}

type Candidate = { key: string; phrase: string };

const CANDIDATES: Candidate[] = LEAD_FIELD_DEFS.flatMap((f) => [
  { key: f.key, phrase: normalizeHeader(f.key) },
  { key: f.key, phrase: normalizeHeader(f.label) },
  ...f.synonyms.map((s) => ({ key: f.key, phrase: normalizeHeader(s) })),
]);

const EXACT = new Map<string, string>();
for (const c of CANDIDATES) {
  if (c.phrase && !EXACT.has(c.phrase)) EXACT.set(c.phrase, c.key);
}

export type MatchResult = { key: string | "ignore"; confidence: "exact" | "likely" | "none" };

/** Pull a trailing/leading index out of a header, eg "Prospect Email 3" -> 3. */
function extractIndex(norm: string): { base: string; index: number | null } {
  const words = norm.split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (ORDINAL_WORDS[w]) {
      const rest = [...words.slice(0, i), ...words.slice(i + 1)].join(" ");
      return { base: rest, index: ORDINAL_WORDS[w]! };
    }
    if (/^[1-8]$/.test(w)) {
      const rest = [...words.slice(0, i), ...words.slice(i + 1)].join(" ");
      return { base: rest, index: Number(w) };
    }
  }
  return { base: norm, index: null };
}

export function matchHeader(header: string): MatchResult {
  const norm = normalizeHeader(header);
  if (!norm) return { key: "ignore", confidence: "none" };

  const direct = EXACT.get(norm);
  if (direct) return { key: direct, confidence: "exact" };

  // Numbered columns: match the base phrase, then re-attach the number.
  const { base, index } = extractIndex(norm);
  if (index) {
    const numbered = EXACT.get(`${base} ${index}`) ?? EXACT.get(norm.replace(/\s+/g, " "));
    if (numbered) return { key: numbered, confidence: "exact" };
    let best: { key: string; score: number } | null = null;
    for (const c of CANDIDATES) {
      const cIdx = extractIndex(c.phrase);
      if (cIdx.index !== index) continue;
      const score = similarity(base, cIdx.base);
      if (!best || score > best.score) best = { key: c.key, score };
    }
    if (best && best.score >= 0.86) return { key: best.key, confidence: "exact" };
    if (best && best.score >= 0.6) return { key: best.key, confidence: "likely" };
  }

  let best: { key: string; score: number } | null = null;
  for (const c of CANDIDATES) {
    const score = similarity(norm, c.phrase);
    if (!best || score > best.score) best = { key: c.key, score };
  }
  if (best && best.score >= 0.88) return { key: best.key, confidence: "exact" };
  if (best && best.score >= 0.62) return { key: best.key, confidence: "likely" };
  return { key: "ignore", confidence: "none" };
}

export function autoMatchField(header: string): LeadFieldKey | "ignore" {
  return matchHeader(header).key;
}

export function columnSignature(headers: string[]): string {
  return headers.map(normalizeHeader).join("|");
}
