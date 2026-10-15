// Import field catalogue + column matching + row conversion for the Import / Export page.
// Ported from the live lt.data chunk.

export type FieldType = "text" | "lookup" | "date" | "list" | "bool" | "percent" | "sentiment" | "email_status";
export type FieldDef = { key: string; label: string; group: string; type: FieldType; synonyms: string[] };
export type Confidence = "exact" | "likely" | "none";

export const MAX_PEOPLE = 8;
export const MAX_FOLLOWUPS = 8;

const BASE_FIELDS: FieldDef[] = [
    {
      key: `company_name`,
      label: `Company name`,
      group: `Company`,
      type: `text`,
      synonyms: [
        `company name`,
        `company`,
        `business name`,
        `business`,
        `brand name`,
        `brand`,
        `account name`,
        `account`,
        `organisation name`,
        `organisation`,
        `organization name`,
        `organization`,
        `client name`,
        `client`,
        `company/brand`,
        `company/brand name`,
        `prospect name`,
        `prospect company`,
        `lead name`,
      ],
    },
    {
      key: `primary_contact`,
      label: `Primary contact`,
      group: `Company`,
      type: `text`,
      synonyms: [`contact`, `contact name`, `poc`, `point of contact`, `decision maker`, `owner name`],
    },
    { key: `country`, label: `Country`, group: `Company`, type: `lookup`, synonyms: [`location`, `region`, `geo`, `market`] },
    { key: `stage`, label: `Stage`, group: `Company`, type: `lookup`, synonyms: [`pipeline stage`, `lead stage`, `deal stage`] },
    { key: `status`, label: `Status`, group: `Company`, type: `text`, synonyms: [`lead status`] },
    { key: `priority`, label: `Priority`, group: `Company`, type: `text`, synonyms: [`importance`] },
    { key: `channel`, label: `Channel`, group: `Company`, type: `lookup`, synonyms: [`outreach channel`, `source`, `platform`] },
    {
      key: `sender_account`,
      label: `Sender account`,
      group: `Company`,
      type: `lookup`,
      synonyms: [`sending account`, `inbox`, `from account`, `sender`, `sent from`, `email account`, `mailbox`],
    },
    {
      key: `date_added`,
      label: `Date added`,
      group: `Company`,
      type: `date`,
      synonyms: [`added`, `created`, `date created`, `date added`, `added on`, `scraped on`, `record created date`],
    },
    {
      key: `last_contacted_at`,
      label: `Outreach sent / Last contacted date`,
      group: `Outcomes`,
      type: `date`,
      synonyms: [
        `last contact`,
        `last contacted date`,
        `last touch`,
        `last outreach`,
        `initial contact date`,
        `first contact date`,
        `initial outreach date`,
        `outreach date`,
        `outreach sent date`,
        `first outreach date`,
        `date first contacted`,
        `first contacted on`,
        `contact date`,
      ],
    },
    {
      key: `next_followup_date`,
      label: `Next follow-up date`,
      group: `Company`,
      type: `date`,
      synonyms: [`next followup`, `next follow up`, `follow up date`, `next action date`],
    },
    { key: `tags`, label: `Tags`, group: `Company`, type: `list`, synonyms: [`labels`, `categories`, `niche`, `industry`, `segment`] },
    {
      key: `website_url`,
      label: `Website URL`,
      group: `Links`,
      type: `text`,
      synonyms: [`website`, `site`, `web`, `url`, `domain`, `homepage`],
    },
    {
      key: `company_linkedin_url`,
      label: `Company LinkedIn URL`,
      group: `Links`,
      type: `text`,
      synonyms: [`company linkedin`, `business linkedin`, `linkedin company`, `company li`],
    },
    {
      key: `instagram_url`,
      label: `Instagram URL`,
      group: `Links`,
      type: `text`,
      synonyms: [`instagram`, `ig`, `insta`, `ig link`, `instagram link`, `ig profile`],
    },
    { key: `youtube_url`, label: `YouTube URL`, group: `Links`, type: `text`, synonyms: [`youtube`, `yt`, `youtube channel`, `yt link`] },
    {
      key: `facebook_url`,
      label: `Facebook URL`,
      group: `Links`,
      type: `text`,
      synonyms: [`facebook`, `fb`, `facebook url`, `fb link`, `facebook page`, `facebook profile`, `other website`],
    },
    {
      key: `community_url`,
      label: `Community link`,
      group: `Links`,
      type: `text`,
      synonyms: [`community`, `community link`, `community url`, `skool`, `discord`, `slack`],
    },
    {
      key: `extra_links`,
      label: `Other links`,
      group: `Links`,
      type: `list`,
      synonyms: [`links`, `other link`, `additional links`, `resources`],
    },
    { key: `other_link_2`, label: `Other link 2`, group: `Links`, type: `text`, synonyms: [`other link 2`, `second link`] },
    { key: `other_link_3`, label: `Other link 3`, group: `Links`, type: `text`, synonyms: [`other link 3`, `third link`] },
    {
      key: `personalized_message`,
      label: `Personalized message / Email draft`,
      group: `Email`,
      type: `text`,
      synonyms: [
        `drafted`,
        `email draft`,
        `draft`,
        `pitch`,
        `personalized message`,
        `outreach message`,
        `first line`,
        `custom message`,
        `message draft`,
        `outreach doc`,
        `copy`,
        `personalized draft`,
      ],
    },
    {
      key: `email_status`,
      label: `Email status (Sent / +Reply / -Reply)`,
      group: `Email`,
      type: `email_status`,
      synonyms: [`email status`, `status of email`, `outreach status`, `email outcome`, `email result`],
    },
    {
      key: `email_sent`,
      label: `Email sent`,
      group: `Email`,
      type: `bool`,
      synonyms: [`sent`, `mail sent`, `email sent?`, `cold email sent`, `initial email sent`],
    },
    {
      key: `email_sent_at`,
      label: `Email sent date`,
      group: `Email`,
      type: `date`,
      synonyms: [`email sent date`, `email sent on`, `date emailed`, `cold email sent date`, `initial email date`, `first email sent date`],
    },
    {
      key: `email_viewed`,
      label: `Email viewed`,
      group: `Email`,
      type: `bool`,
      synonyms: [`email viewed?`, `opened`, `email opened`, `open`, `viewed`, `seen`],
    },
    { key: `email_viewed_at`, label: `Email viewed date`, group: `Email`, type: `date`, synonyms: [`opened on`, `viewed on`, `open date`] },
    {
      key: `email_replied`,
      label: `Email replied`,
      group: `Email`,
      type: `bool`,
      synonyms: [`replied`, `reply`, `response`, `responded`, `got reply`],
    },
    {
      key: `email_replied_at`,
      label: `Email replied date`,
      group: `Email`,
      type: `date`,
      synonyms: [`reply date`, `replied on`, `response date`],
    },
    {
      key: `reply_sentiment`,
      label: `Reply sentiment`,
      group: `Email`,
      type: `sentiment`,
      synonyms: [`sentiment`, `reply type`, `positive/negative`, `response type`],
    },
    {
      key: `loom_url`,
      label: `Loom link`,
      group: `Loom`,
      type: `text`,
      synonyms: [`loom links`, `loom`, `loom url`, `video link`, `loom video`],
    },
    {
      key: `loom_sent`,
      label: `Loom sent`,
      group: `Loom`,
      type: `bool`,
      synonyms: [`loom sent?`, `loom sent yes/no`, `video sent`, `sent loom`],
    },
    {
      key: `loom_sent_at`,
      label: `Loom sent date`,
      group: `Loom`,
      type: `date`,
      synonyms: [`loom sent on`, `loom date`, `video sent date`],
    },
    {
      key: `loom_watched`,
      label: `Loom watched`,
      group: `Loom`,
      type: `bool`,
      synonyms: [`loom watched?`, `watched`, `video watched`, `loom viewed`],
    },
    { key: `loom_watched_at`, label: `Loom watched date`, group: `Loom`, type: `date`, synonyms: [`loom watched on`, `watched on`] },
    {
      key: `loom_watch_percent`,
      label: `Loom watch %`,
      group: `Loom`,
      type: `percent`,
      synonyms: [`loom watch percent`, `watch %`, `watch percent`, `loom watch % type 0 100`, `percent watched`],
    },
    {
      key: `linkedin_connection_sent`,
      label: `LinkedIn connection request sent`,
      group: `LinkedIn`,
      type: `bool`,
      synonyms: [`connection request`, `li connect`, `linkedin connect`, `connection sent`, `linkedin request`, `invite sent`],
    },
    {
      key: `linkedin_connection_sent_at`,
      label: `LinkedIn connection sent date`,
      group: `LinkedIn`,
      type: `date`,
      synonyms: [`connection request date`, `linkedin connect date`],
    },
    {
      key: `linkedin_sent`,
      label: `LinkedIn message sent`,
      group: `LinkedIn`,
      type: `bool`,
      synonyms: [`linkedin omni`, `linkedin dm`, `li dm`, `linkedin message`, `linkedin outreach`, `li message sent`, `linkedin sent`],
    },
    {
      key: `linkedin_sent_at`,
      label: `LinkedIn message sent date`,
      group: `LinkedIn`,
      type: `date`,
      synonyms: [`linkedin sent on`, `linkedin message date`],
    },
    {
      key: `linkedin_replied`,
      label: `LinkedIn replied`,
      group: `LinkedIn`,
      type: `bool`,
      synonyms: [`linkedin reply`, `li reply`, `linkedin response`],
    },
    { key: `linkedin_replied_at`, label: `LinkedIn replied date`, group: `LinkedIn`, type: `date`, synonyms: [`linkedin reply date`] },
    {
      key: `instagram_sent`,
      label: `Instagram message sent`,
      group: `Instagram`,
      type: `bool`,
      synonyms: [`ig omni`, `ig dm`, `instagram dm`, `instagram message`, `ig message sent`, `instagram outreach`, `instagram sent`],
    },
    {
      key: `instagram_sent_at`,
      label: `Instagram message sent date`,
      group: `Instagram`,
      type: `date`,
      synonyms: [`ig sent date`, `instagram sent on`],
    },
    {
      key: `instagram_replied`,
      label: `Instagram replied`,
      group: `Instagram`,
      type: `bool`,
      synonyms: [`ig reply`, `instagram reply`, `ig response`],
    },
    { key: `instagram_replied_at`, label: `Instagram replied date`, group: `Instagram`, type: `date`, synonyms: [`ig reply date`] },
    {
      key: `meeting_booked`,
      label: `Meeting booked`,
      group: `Outcomes`,
      type: `bool`,
      synonyms: [`meeting booked?`, `call booked`, `dc set`, `discovery call`, `meeting`, `booked`, `appointment`],
    },
    {
      key: `meeting_booked_at`,
      label: `Meeting booked date`,
      group: `Outcomes`,
      type: `date`,
      synonyms: [`meeting date`, `call date`, `booked on`],
    },
    {
      key: `client_closed`,
      label: `Client closed`,
      group: `Outcomes`,
      type: `bool`,
      synonyms: [`closed`, `won`, `client won`, `deal closed`],
    },
    {
      key: `client_closed_at`,
      label: `Client closed date`,
      group: `Outcomes`,
      type: `date`,
      synonyms: [`closed on`, `close date`, `won date`],
    },
    {
      key: `message_angle`,
      label: `Message angle / Hook`,
      group: `Notes`,
      type: `text`,
      synonyms: [`hook`, `angle`, `pitch angle`, `message angle`, `hook / message angle`, `hook / angle`],
    },
    {
      key: `research_notes`,
      label: `Research notes`,
      group: `Notes`,
      type: `text`,
      synonyms: [`research notes`, `research`, `comments`, `remarks`, `observations`],
    },
    {
      key: `additional_notes`,
      label: `Additional notes`,
      group: `Notes`,
      type: `text`,
      synonyms: [
        `notes`,
        `extra notes`,
        `other notes`,
        `misc`,
        `misc notes`,
        `misc note`,
        `miscellaneous notes`,
        `miscellaneous`,
        `general notes`,
        `notes / misc`,
        `misc comments`,
        `note`,
        `internal notes`,
      ],
    },
];

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function peopleFields(): FieldDef[] {
  const out: FieldDef[] = [];
  for (let t = 1; t <= MAX_PEOPLE; t++) {
    out.push({
      key: `person_${t}_name`,
      label: `Person ${t} name`,
      group: "People",
      type: "text",
      synonyms: [`contact ${t} name`, `prospect ${t} name`, `person ${t}`, `name ${t}`, `first name ${t}`],
    });
    out.push({
      key: `person_${t}_title`,
      label: `Person ${t} job title`,
      group: "People",
      type: "text",
      synonyms: [`title ${t}`, `role ${t}`, `position ${t}`, `job title ${t}`, `occupation ${t}`, "occupation", "profession", "designation"],
    });
    out.push({
      key: `person_${t}_email`,
      label: `Person ${t} email`,
      group: "People",
      type: "text",
      synonyms: [`prospect email ${t}`, `email ${t}`, `contact email ${t}`, `email address ${t}`, `mail ${t}`],
    });
    out.push({
      key: `person_${t}_linkedin`,
      label: `Person ${t} LinkedIn`,
      group: "People",
      type: "text",
      synonyms: [`personal linkedin ${t}`, `linkedin ${t}`, `prospect linkedin ${t}`, `li ${t}`],
    });
    out.push({
      key: `person_${t}_instagram`,
      label: `Person ${t} Instagram`,
      group: "People",
      type: "text",
      synonyms: [`personal instagram ${t}`, `instagram ${t}`, `ig ${t}`],
    });
    out.push({
      key: `person_${t}_phone`,
      label: `Person ${t} phone`,
      group: "People",
      type: "text",
      synonyms: [`phone ${t}`, `mobile ${t}`, `number ${t}`, `contact number ${t}`],
    });
  }
  return out;
}

function followupFields(): FieldDef[] {
  const out: FieldDef[] = [];
  for (let t = 1; t <= MAX_FOLLOWUPS; t++) {
    const n = ORDINALS[t - 1] ?? `${t}th`;
    out.push({
      key: `fup_${t}_status`,
      label: `Follow-up ${t} status`,
      group: "Follow-ups",
      type: "text",
      synonyms: [`fup ${t} status`, `fup ${t}`, `follow up ${t} status`, `followup ${t}`, `${n} fup status`],
    });
    out.push({
      key: `fup_${t}_date`,
      label: `Follow-up ${t} date`,
      group: "Follow-ups",
      type: "date",
      synonyms: [`fup ${t} date`, `${n} fup date`, `${n} follow up date`, `follow up ${t} date`, `${n} days`, `${n} fup`, `${n}`],
    });
  }
  return out;
}

export const IMPORT_FIELDS: FieldDef[] = [...BASE_FIELDS, ...peopleFields(), ...followupFields()];
export const FIELD_BY_KEY = new Map(IMPORT_FIELDS.map((f) => [f.key, f]));

export function normalizeHeader(e: string) {
  return e
    .replace(/[\r\n]+/g, " ")
    .replace(/[_\-/\\]+/g, " ")
    .replace(/[^a-z0-9%+ ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\+\s*\d+\s*days?/g, "days")
    .replace(/\byes\s+no\b|\bno\s+yes\b|\by\s+n\b/g, "")
    .replace(/\btype\s+0\s+100\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ORDINAL_WORDS: Record<string, number> = {
  "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3, "4th": 4, fourth: 4,
  "5th": 5, fifth: 5, "6th": 6, sixth: 6, "7th": 7, seventh: 7, "8th": 8, eighth: 8,
};

function levenshtein(a: string, b: string) {
  const n = a.length;
  const r = b.length;
  if (n === 0) return r;
  if (r === 0) return n;
  let prev = Array.from({ length: r + 1 }, (_, i) => i);
  for (let i = 1; i <= n; i++) {
    const row = [i];
    for (let j = 1; j <= r; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((row[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = row;
  }
  return prev[r] ?? 0;
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const as = new Set(a.split(" ").filter(Boolean));
  const bs = new Set(b.split(" ").filter(Boolean));
  let shared = 0;
  as.forEach((w) => {
    if (bs.has(w)) shared++;
  });
  const tokens = shared / Math.max(as.size, bs.size);
  const chars = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return Math.max(tokens * 0.75 + chars * 0.25, chars * 0.9, tokens * 0.95);
}

const PHRASES = IMPORT_FIELDS.flatMap((f) => [
  { key: f.key, phrase: normalizeHeader(f.key) },
  { key: f.key, phrase: normalizeHeader(f.label) },
  ...f.synonyms.map((s) => ({ key: f.key, phrase: normalizeHeader(s) })),
]);
const EXACT_PHRASE = new Map<string, string>();
for (const p of PHRASES) if (p.phrase && !EXACT_PHRASE.has(p.phrase)) EXACT_PHRASE.set(p.phrase, p.key);

function splitIndex(e: string): { base: string; index: number | null } {
  const words = e.split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (ORDINAL_WORDS[w]) return { base: [...words.slice(0, i), ...words.slice(i + 1)].join(" "), index: ORDINAL_WORDS[w] };
    if (/^[1-8]$/.test(w)) return { base: [...words.slice(0, i), ...words.slice(i + 1)].join(" "), index: Number(w) };
  }
  return { base: e, index: null };
}

export function matchHeader(header: string): { key: string; confidence: Confidence } {
  const t = normalizeHeader(header);
  if (!t) return { key: "ignore", confidence: "none" };
  const exact = EXACT_PHRASE.get(t);
  if (exact) return { key: exact, confidence: "exact" };
  const { base, index } = splitIndex(t);
  if (index) {
    const e = EXACT_PHRASE.get(`${base} ${index}`) ?? EXACT_PHRASE.get(t.replace(/\s+/g, " "));
    if (e) return { key: e, confidence: "exact" };
    let best: { key: string; score: number } | null = null;
    for (const p of PHRASES) {
      const s = splitIndex(p.phrase);
      if (s.index !== index) continue;
      const score = similarity(base, s.base);
      if (!best || score > best.score) best = { key: p.key, score };
    }
    if (best && best.score >= 0.86) return { key: best.key, confidence: "exact" };
    if (best && best.score >= 0.6) return { key: best.key, confidence: "likely" };
  }
  let best: { key: string; score: number } | null = null;
  for (const p of PHRASES) {
    const score = similarity(t, p.phrase);
    if (!best || score > best.score) best = { key: p.key, score };
  }
  return best && best.score >= 0.88
    ? { key: best.key, confidence: "exact" }
    : best && best.score >= 0.62
      ? { key: best.key, confidence: "likely" }
      : { key: "ignore", confidence: "none" };
}

export function headerSignature(headers: string[]) {
  return headers.map(normalizeHeader).join("|");
}

const TRUTHY = new Set(["yes", "y", "true", "t", "1", "x", "✓", "✔", "checked", "done", "sent", "complete", "completed", "ok"]);
const FALSY = new Set(["no", "n", "false", "f", "0", "-", "none", "not sent", "pending", "na", "n/a"]);

export function parseBool(e: string): boolean | null {
  const t = e.trim().toLowerCase();
  if (!t) return null;
  if (TRUTHY.has(t)) return true;
  if (FALSY.has(t)) return false;
  return t.includes("reply") || t.includes("watched") || t.includes("open") ? true : null;
}

function parsePercent(e: string): number | null {
  const t = e.trim().replace("%", "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const r = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(r)));
}

function parseList(e: string) {
  return e
    .split(/[;,\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function ymd(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const r = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(r.getTime()) ? null : r.toISOString().slice(0, 10);
}

export function parseDate(e: string): string | null {
  const t = e.trim();
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serial = Number(t);
    if (serial > 2e4 && serial < 6e4) return new Date(Math.round((serial - 25569) * 86400 * 1e3)).toISOString().slice(0, 10);
  }
  const iso = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2e3;
    return a > 12 && b <= 12 ? ymd(y, b, a) : b > 12 && a <= 12 ? ymd(y, a, b) : ymd(y, b, a);
  }
  const named = t.toLowerCase().match(/^(\d{1,2})?\s*([a-z]{3,9})\.?\s*(\d{1,2})?,?\s*(\d{4})?/);
  if (named && named[2] && MONTHS[named[2].slice(0, 4)] !== undefined) {
    const m = MONTHS[named[2].slice(0, 4)] ?? MONTHS[named[2].slice(0, 3)];
    const d = Number(named[1] ?? named[3] ?? 1);
    const y = Number(named[4] ?? new Date().getFullYear());
    if (m) return ymd(y, m, d);
  }
  const a = new Date(t);
  return Number.isNaN(a.getTime()) ? null : a.toISOString().slice(0, 10);
}

function parseEmailStatus(e: string) {
  const t = e.trim().toLowerCase();
  if (!t) return null;
  const pos = t.includes("+") || t.includes("positive") || t.includes("interested");
  const neg = t.includes("-reply") || t.includes("negative") || t.includes("not interested") || t.includes("no thanks");
  const replied = pos || neg || t.includes("reply") || t.includes("replied") || t.includes("response");
  if (!(replied || t.includes("sent") || t.includes("emailed") || t.includes("contacted")) && !replied) return null;
  return { sent: true, replied, sentiment: pos ? "positive" : neg ? "negative" : replied ? "neutral" : null };
}

function parseSentiment(e: string) {
  const t = e.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("+") || t.startsWith("pos") || (t.includes("interested") && !t.includes("not"))) return "positive";
  if (t.startsWith("neg") || t.includes("-") || t.includes("not interested")) return "negative";
  if (t.startsWith("neu")) return "neutral";
  return null;
}

export function normalizeName(e: string) {
  return e
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TITLE_WORDS =
  "ceo|coo|cmo|cto|cfo|cro|cpo|vp|svp|evp|founder|co-founder|cofounder|owner|host|co-host|cohost|president|director|manager|head|partner|principal|editor|producer|lead";
const SINGLE_TITLE = RegExp(`^(${TITLE_WORDS})$`, "i");
const TITLE_PHRASE = RegExp(`^(?:(?:${TITLE_WORDS})(?:\\s+of\\s+[\\w ]+)?[\\s/&,]*)+$`, "i");
const PLAIN_DATE_KEYS = new Set(["date_added", "next_followup_date"]);

function toTimestamp(d: string | null) {
  return d ? `${d}T09:00:00.000Z` : null;
}

export type Lookups = {
  stages: Map<string, string>;
  channels: Map<string, string>;
  senders: Map<string, string>;
  countries: Map<string, string>;
};

export type ImportPerson = {
  index: number;
  person_name: string | null;
  job_title: string | null;
  email: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  phone: string | null;
};
export type ImportFollowup = { sequence_number: number; scheduled_date: string | null; status: string; notes: string | null };
export type ConvertedRow = {
  lead: Record<string, unknown>;
  people: ImportPerson[];
  followups: ImportFollowup[];
  tags: string[];
  links: string[];
  warnings: string[];
};

const EMAIL_RE = /[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g;

export function convertRow(
  values: Record<string, string>,
  lookups: Lookups,
  opts: { leftovers?: Record<string, string>; keepLeftovers?: boolean },
): ConvertedRow {
  const lead: Record<string, unknown> = {};
  const warnings: string[] = [];
  const people = new Map<number, ImportPerson>();
  const followups = new Map<number, ImportFollowup>();
  const tags: string[] = [];
  const links: string[] = [];
  const contactNotes: string[] = [];
  const importNotes: string[] = [];
  const formulaError = /^#(?:REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!)/i;
  const person = (i: number) => {
    let p = people.get(i);
    if (!p) {
      p = { index: i, person_name: null, job_title: null, email: null, linkedin_url: null, instagram_url: null, phone: null };
      people.set(i, p);
    }
    return p;
  };
  const followup = (i: number) => {
    let f = followups.get(i);
    if (!f) {
      f = { sequence_number: i, scheduled_date: null, status: "pending", notes: null };
      followups.set(i, f);
    }
    return f;
  };

  for (const [key, raw] of Object.entries(values)) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    if (formulaError.test(v)) {
      warnings.push(`Skipped spreadsheet formula error "${v}" in ${key}`);
      continue;
    }
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;

    const pm = key.match(/^person_(\d+)_(\w+)$/);
    if (pm) {
      const p = person(Number(pm[1]));
      const part = pm[2];
      if (part === "name") p.person_name = v;
      else if (part === "title") p.job_title = v;
      else if (part === "email") {
        const emails = v.match(EMAIL_RE);
        if (!emails) contactNotes.push(`Person ${pm[1]} email note: ${v}`);
        else {
          p.email = emails[0].replace(/\.+$/, "").toLowerCase();
          const rest = v
            .replace(EMAIL_RE, " ")
            .replace(/^[\s|,/;:-]+|[\s|,/;:-]+$/g, "")
            .replace(/\s*[|/]\s*/g, " | ")
            .trim();
          const extra = emails.slice(1).map((s) => s.replace(/\.+$/, ""));
          const notes: string[] = [];
          if (rest) {
            const paren = [...rest.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
            const parts = rest
              .replace(/\([^)]*\)/g, " ")
              .split(/\s*[|,]\s*/)
              .map((s) => s.trim())
              .filter(Boolean);
            const nameIdx = parts.findIndex((s) => /^[A-Za-z][A-Za-z.' -]{0,40}$/.test(s) && s.split(/\s+/).length <= 4);
            if (nameIdx >= 0 && !p.person_name) {
              let name = parts.splice(nameIdx, 1)[0].replace(/\s+/g, " ");
              const tm = name.match(/^(.*?)\s+(\S+)$/);
              if (tm && SINGLE_TITLE.test(tm[2])) {
                name = tm[1];
                p.job_title ||= tm[2];
              }
              p.person_name = name;
            }
            for (const s of [...paren, ...parts]) {
              if (!p.job_title && TITLE_PHRASE.test(s)) p.job_title = s;
              else notes.push(s);
            }
          }
          if (extra.length) notes.push(`also: ${extra.join(", ")}`);
          if (notes.length) contactNotes.push(`Person ${pm[1]} (${p.email}): ${notes.join("; ")}`);
        }
      } else if (part === "linkedin") p.linkedin_url = v;
      else if (part === "instagram") p.instagram_url = v;
      else if (part === "phone") p.phone = v;
      continue;
    }

    const fm = key.match(/^fup_(\d+)_(status|date)$/);
    if (fm) {
      const f = followup(Number(fm[1]));
      if (fm[2] === "date") {
        const d = parseDate(v);
        if (!d) {
          warnings.push(`Could not read follow-up ${fm[1]} date "${v}"; preserved in additional notes`);
          importNotes.push(`Import note : Follow-up ${fm[1]} date: ${v} (date could not be parsed)`);
        }
        f.scheduled_date = d;
      } else {
        f.status = parseBool(v) ? "sent" : "pending";
        f.notes = v;
      }
      continue;
    }

    switch (field.type) {
      case "bool": {
        const b = parseBool(v);
        if (b === null) {
          warnings.push(`Could not read "${v}" for ${field.label}; preserved in additional notes`);
          importNotes.push(`Import note : ${field.label}: ${v} (not recognized as a yes/no value)`);
          break;
        }
        lead[key] = b;
        const atKey = `${key}_at`;
        if (b && FIELD_BY_KEY.has(atKey) && lead[atKey] === undefined) lead[atKey] = null;
        break;
      }
      case "date": {
        const d = parseDate(v);
        if (!d) {
          warnings.push(`Could not read date "${v}" for ${field.label}; preserved in additional notes`);
          importNotes.push(`Import note : ${field.label}: ${v} (date could not be parsed)`);
          break;
        }
        lead[key] = PLAIN_DATE_KEYS.has(key) ? d : key.endsWith("_at") ? toTimestamp(d) : d;
        if (key === "email_sent_at") lead.email_sent = true;
        if (key === "instagram_sent_at") lead.instagram_sent = true;
        if (key === "linkedin_sent_at") lead.linkedin_sent = true;
        if (key === "loom_sent_at") lead.loom_sent = true;
        if (key === "email_replied_at") lead.email_replied = true;
        if (key === "meeting_booked_at") lead.meeting_booked = true;
        if (key === "client_closed_at") lead.client_closed = true;
        break;
      }
      case "percent": {
        const p = parsePercent(v);
        if (p === null) {
          warnings.push(`Could not read percent "${v}" for ${field.label}; preserved in additional notes`);
          importNotes.push(`Import note : ${field.label}: ${v} (percentage could not be parsed)`);
        } else lead[key] = p;
        break;
      }
      case "list": {
        const items = parseList(v);
        if (key === "tags") tags.push(...items);
        else if (key === "extra_links") links.push(...items);
        break;
      }
      case "sentiment": {
        const s = parseSentiment(v);
        if (s) lead.reply_sentiment = s;
        else {
          warnings.push(`Could not classify reply sentiment "${v}"; preserved in additional notes`);
          importNotes.push(`Import note : Reply sentiment: ${v} (not recognized)`);
        }
        break;
      }
      case "email_status": {
        const s = parseEmailStatus(v);
        if (!s) {
          warnings.push(`Could not interpret email status "${v}"; preserved in additional notes`);
          importNotes.push(`Import note : Email status: ${v} (not recognized)`);
          break;
        }
        lead.email_sent = true;
        if (s.replied) {
          lead.email_replied = true;
          lead.email_viewed = true;
        }
        if (s.sentiment) lead.reply_sentiment = s.sentiment;
        break;
      }
      case "lookup": {
        const n = normalizeName(v);
        if (key === "country") lead.country_id = lookups.countries.get(n) ?? null;
        else if (key === "stage") lead.stage_id = lookups.stages.get(n) ?? null;
        else if (key === "channel") lead.channel_id = lookups.channels.get(n) ?? null;
        else if (key === "sender_account") lead.sender_account_id = lookups.senders.get(n) ?? null;
        if (
          (key === "country" && !lead.country_id) ||
          (key === "stage" && !lead.stage_id) ||
          (key === "channel" && !lead.channel_id) ||
          (key === "sender_account" && !lead.sender_account_id)
        ) {
          warnings.push(`Unknown ${field.label.toLowerCase()} "${v}"; preserved in additional notes if not created`);
          importNotes.push(`Import note : ${field.label}: ${v} (not matched to a workspace setting)`);
        }
        break;
      }
      default: {
        if (key === "facebook_url" || key === "community_url" || key.startsWith("other_link_")) {
          const urls = v.match(/https?:\/\/[^\s,;|]+/gi) || [v];
          for (const u of urls) if (u.startsWith("http://") || u.startsWith("https://")) links.push(u);
          break;
        }
        if (key.endsWith("_url")) {
          const urls = v.match(/https?:\/\/[^\s,;|]+/gi);
          if (urls && urls.length > 1) {
            lead[key] = urls[0];
            links.push(...urls.slice(1));
            break;
          }
        }
        lead[key] = v;
      }
    }
  }

  if (!lead.company_name) {
    if (lead.primary_contact) lead.company_name = lead.primary_contact;
    else {
      const p = [...people.values()].find((x) => x.person_name);
      if (p?.person_name) lead.company_name = p.person_name;
    }
  }
  if (contactNotes.length || importNotes.length) {
    const all = [...contactNotes, ...importNotes];
    lead.additional_notes = (typeof lead.additional_notes === "string" ? `${lead.additional_notes}\n` : "") + all.join("\n");
  }
  if (opts.keepLeftovers && opts.leftovers) {
    const lines = Object.entries(opts.leftovers)
      .filter(([, v]) => (v ?? "").trim())
      .map(([k, v]) => `${k}: ${v.trim()}`);
    if (lines.length > 0)
      lead.additional_notes = `${typeof lead.additional_notes === "string" ? `${lead.additional_notes}\n` : ""}${lines.join("\n")}`;
  }
  for (const [flag, at] of [
    ["email_sent", "email_sent_at"],
    ["email_viewed", "email_viewed_at"],
    ["email_replied", "email_replied_at"],
    ["loom_sent", "loom_sent_at"],
    ["loom_watched", "loom_watched_at"],
    ["linkedin_connection_sent", "linkedin_connection_sent_at"],
    ["linkedin_sent", "linkedin_sent_at"],
    ["linkedin_replied", "linkedin_replied_at"],
    ["instagram_sent", "instagram_sent_at"],
    ["instagram_replied", "instagram_replied_at"],
    ["meeting_booked", "meeting_booked_at"],
    ["client_closed", "client_closed_at"],
  ]) {
    if (lead[flag] === true && !lead[at])
      lead[at] = toTimestamp(typeof lead.date_added === "string" ? lead.date_added : null) ?? new Date().toISOString();
  }
  return {
    lead,
    people: [...people.values()].filter((p) => p.person_name || p.email || p.linkedin_url || p.instagram_url || p.phone),
    followups: [...followups.values()].filter((f) => f.scheduled_date || f.notes),
    tags,
    links,
    warnings,
  };
}

export type AnalysisWarning = { id: string; type: string; title: string; detail: string; action: string };
export type SheetAnalysis = {
  stages: { name: string; count: number }[];
  channels: { name: string; count: number }[];
  senderAccounts: { name: string; count: number }[];
  countries: { name: string; count: number }[];
  customColumns: { header: string; sample: string }[];
  warnings: AnalysisWarning[];
  hasNewItems: boolean;
};

const isMultiValueField = (k: string) =>
  k === "ignore" ||
  k === "extra_links" ||
  k === "tags" ||
  k === "additional_notes" ||
  k === "facebook_url" ||
  k === "community_url" ||
  k.startsWith("other_link_");

export function analyzeSheet(headers: string[], rows: string[][], mapping: Record<number, string>, lookups: Lookups): SheetAnalysis {
  const stages = new Map<string, { raw: string; count: number }>();
  const channels = new Map<string, { raw: string; count: number }>();
  const senders = new Map<string, { raw: string; count: number }>();
  const countries = new Map<string, { raw: string; count: number }>();
  const customColumns: { header: string; sample: string }[] = [];
  const warnings: AnalysisWarning[] = [];
  const usage = new Map<string, number>();
  for (const k of Object.values(mapping)) if (k && !isMultiValueField(k)) usage.set(k, (usage.get(k) ?? 0) + 1);
  for (const [k, n] of usage.entries())
    if (n > 1)
      warnings.push({
        id: `dup-map-${k}`,
        type: "duplicate_mapping",
        title: `Multiple columns mapped to "${k}"`,
        detail: `${n} columns are mapped to the same field. Values will be concatenated.`,
        action: "Merged with comma",
      });
  const attachmentRe = /\b(image|photo|picture|attachment|attached file|document|pdf|invoice file|brochure|logo|screenshot|file upload)\b/i;
  headers.forEach((h, i) => {
    if (attachmentRe.test(h)) {
      const sample = rows.find((r) => (r[i] ?? "").trim())?.[i]?.trim() ?? "";
      const isLink = /https?:\/\//i.test(sample);
      warnings.push({
        id: `unsupported-attachment-${i}`,
        type: "unsupported_content",
        title: `Check attachment-style column "${h || `Column ${i + 1}`}"`,
        detail: isLink
          ? "This column appears to contain file or image links. The link text can be preserved, but Tracker does not download or attach the file automatically during spreadsheet import."
          : "Spreadsheet imports cannot reliably extract embedded images or binary file attachments. Any readable text is preserved as a leftover when Keep leftovers is enabled; upload files manually on the lead after import.",
        action: isLink ? "Preserve link text; attach manually if needed" : "Manual file upload may be required",
      });
    }
  });
  headers.forEach((h, i) => {
    if ((mapping[i] ?? "ignore") === "ignore") {
      const sample = rows.find((r) => (r[i] ?? "").trim())?.[i]?.trim();
      if (sample) customColumns.push({ header: h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`, sample });
    }
  });
  let noIdentity = 0;
  let formulaErrors = 0;
  let badEmails = 0;
  let badEmailSample = "";
  let badDates = 0;
  let badDateSample = "";
  const formulaRe = /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!)/i;
  const track = (map: Map<string, { raw: string; count: number }>, known: Map<string, string>, v: string) => {
    const n = normalizeName(v);
    if (n && !known.has(n)) {
      const e = map.get(n) ?? { raw: v, count: 0 };
      e.count++;
      map.set(n, e);
    }
  };
  rows.forEach((row) => {
    let hasName = false;
    let hasEmail = false;
    headers.forEach((_, i) => {
      const k = mapping[i] ?? "ignore";
      const v = (row[i] ?? "").trim();
      if (!v) return;
      if (formulaRe.test(v)) {
        formulaErrors++;
        return;
      }
      if (k === "company_name" || k === "primary_contact" || k.endsWith("_name")) hasName = true;
      if (k === "stage") track(stages, lookups.stages, v);
      else if (k === "channel") track(channels, lookups.channels, v);
      else if (k === "sender_account") track(senders, lookups.senders, v);
      else if (k === "country") track(countries, lookups.countries, v);
      if (k === "primary_contact" || k.endsWith("_email")) {
        if (v.match(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/)) hasEmail = true;
        else if (k.endsWith("_email")) {
          badEmails++;
          badEmailSample ||= v;
        }
      }
      if ((k.endsWith("_at") || k.endsWith("_date") || k === "date_added") && !parseDate(v)) {
        badDates++;
        badDateSample ||= v;
      }
    });
    if (!hasName && !hasEmail) noIdentity++;
  });
  if (noIdentity > 0)
    warnings.push({
      id: "warn-empty-rows",
      type: "invalid_identifier",
      title: `${noIdentity} row(s) missing lead name or email`,
      detail: "Rows without any company name, person name, or email address cannot be assigned an identity.",
      action: "Skipped on import",
    });
  if (badEmails > 0)
    warnings.push({
      id: "warn-invalid-emails",
      type: "unparseable_value",
      title: `${badEmails} note(s) in email columns`,
      detail: `Values like "${badEmailSample}" do not contain a valid @ email address.`,
      action: "Saved in contact notes",
    });
  if (badDates > 0)
    warnings.push({
      id: "warn-invalid-dates",
      type: "unparseable_value",
      title: `${badDates} unparseable date value(s)`,
      detail: `Values like "${badDateSample}" could not be recognized as calendar dates.`,
      action: "Saved in row notes",
    });
  if (formulaErrors > 0)
    warnings.push({
      id: "warn-formula-errors",
      type: "formula_error",
      title: `${formulaErrors} broken formula cell(s)`,
      detail: "Cells containing Excel formula errors (e.g. #REF!, #VALUE!).",
      action: "Cleaned to empty cell",
    });
  const list = (m: Map<string, { raw: string; count: number }>) => Array.from(m.values()).map((e) => ({ name: e.raw, count: e.count }));
  const s = list(stages);
  const c = list(channels);
  const se = list(senders);
  const co = list(countries);
  return {
    stages: s,
    channels: c,
    senderAccounts: se,
    countries: co,
    customColumns,
    warnings,
    hasNewItems: s.length > 0 || c.length > 0 || se.length > 0 || co.length > 0 || customColumns.length > 0 || warnings.length > 0,
  };
}

export { isMultiValueField };
