import { FIELD_BY_KEY } from "@/components/data/importFields";
import {
  normalizeLookup,
  parseBool,
  parseDate,
  parseEmailStatus,
  parseList,
  parsePercent,
  parseSentiment,
} from "@/components/data/parseValue";

export type LookupMaps = {
  countries: Map<string, string>;
  stages: Map<string, string>;
  channels: Map<string, string>;
  senders: Map<string, string>;
};

export type PersonDraft = {
  index: number;
  person_name: string | null;
  job_title: string | null;
  email: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  phone: string | null;
};

export type FollowupDraft = {
  sequence_number: number;
  scheduled_date: string | null;
  status: string;
  notes: string | null;
};

export type BuiltRow = {
  lead: Record<string, unknown>;
  people: PersonDraft[];
  followups: FollowupDraft[];
  tags: string[];
  links: string[];
  warnings: string[];
};

const DATE_ONLY = new Set(["date_added", "next_followup_date"]);

function stamp(value: string | null): string | null {
  if (!value) return null;
  return `${value}T09:00:00.000Z`;
}

export function buildRow(
  mapped: Record<string, string>,
  lookups: LookupMaps,
  opts: { leftovers?: Record<string, string>; keepLeftovers: boolean },
): BuiltRow {
  const lead: Record<string, unknown> = {};
  const warnings: string[] = [];
  const people = new Map<number, PersonDraft>();
  const followups = new Map<number, FollowupDraft>();
  const tags: string[] = [];
  const links: string[] = [];

  const person = (n: number): PersonDraft => {
    let p = people.get(n);
    if (!p) {
      p = { index: n, person_name: null, job_title: null, email: null, linkedin_url: null, instagram_url: null, phone: null };
      people.set(n, p);
    }
    return p;
  };
  const fup = (n: number): FollowupDraft => {
    let f = followups.get(n);
    if (!f) {
      f = { sequence_number: n, scheduled_date: null, status: "pending", notes: null };
      followups.set(n, f);
    }
    return f;
  };

  for (const [key, rawValue] of Object.entries(mapped)) {
    const raw = (rawValue ?? "").trim();
    if (!raw) continue;
    const def = FIELD_BY_KEY.get(key);
    if (!def) continue;

    const personMatch = key.match(/^person_(\d+)_(\w+)$/);
    if (personMatch) {
      const p = person(Number(personMatch[1]));
      const part = personMatch[2];
      if (part === "name") p.person_name = raw;
      else if (part === "title") p.job_title = raw;
      else if (part === "email") p.email = raw;
      else if (part === "linkedin") p.linkedin_url = raw;
      else if (part === "instagram") p.instagram_url = raw;
      else if (part === "phone") p.phone = raw;
      continue;
    }

    const fupMatch = key.match(/^fup_(\d+)_(status|date)$/);
    if (fupMatch) {
      const f = fup(Number(fupMatch[1]));
      if (fupMatch[2] === "date") {
        const d = parseDate(raw);
        if (!d) warnings.push(`Could not read follow-up ${fupMatch[1]} date "${raw}"`);
        f.scheduled_date = d;
      } else {
        const b = parseBool(raw);
        f.status = b ? "sent" : "pending";
        f.notes = raw;
      }
      continue;
    }

    switch (def.type) {
      case "bool": {
        const b = parseBool(raw);
        if (b === null) {
          warnings.push(`Could not read "${raw}" for ${def.label}`);
          break;
        }
        lead[key] = b;
        const atKey = `${key}_at`;
        if (b && FIELD_BY_KEY.has(atKey) && lead[atKey] === undefined) lead[atKey] = null;
        break;
      }
      case "date": {
        const d = parseDate(raw);
        if (!d) {
          warnings.push(`Could not read date "${raw}" for ${def.label}`);
          break;
        }
        lead[key] = DATE_ONLY.has(key) ? d : key.endsWith("_at") ? stamp(d) : d;
        break;
      }
      case "percent": {
        const p = parsePercent(raw);
        if (p === null) warnings.push(`Could not read percent "${raw}"`);
        else lead[key] = p;
        break;
      }
      case "list": {
        const items = parseList(raw);
        if (key === "tags") tags.push(...items);
        else if (key === "extra_links") links.push(...items);
        break;
      }
      case "sentiment": {
        const s = parseSentiment(raw);
        if (s) lead["reply_sentiment"] = s;
        break;
      }
      case "email_status": {
        const st = parseEmailStatus(raw);
        if (!st) break;
        lead["email_sent"] = true;
        if (st.replied) {
          lead["email_replied"] = true;
          lead["email_viewed"] = true;
        }
        if (st.sentiment) lead["reply_sentiment"] = st.sentiment;
        break;
      }
      case "lookup": {
        const norm = normalizeLookup(raw);
        if (key === "country") lead["country_id"] = lookups.countries.get(norm) ?? null;
        else if (key === "stage") lead["stage_id"] = lookups.stages.get(norm) ?? null;
        else if (key === "channel") lead["channel_id"] = lookups.channels.get(norm) ?? null;
        else if (key === "sender_account") lead["sender_account_id"] = lookups.senders.get(norm) ?? null;
        if (
          (key === "country" && !lead["country_id"]) ||
          (key === "stage" && !lead["stage_id"]) ||
          (key === "channel" && !lead["channel_id"]) ||
          (key === "sender_account" && !lead["sender_account_id"])
        ) {
          warnings.push(`Unknown ${def.label.toLowerCase()} "${raw}"`);
        }
        break;
      }
      default:
        lead[key] = raw;
    }
  }

  if (opts.keepLeftovers && opts.leftovers) {
    const extra = Object.entries(opts.leftovers)
      .filter(([, v]) => (v ?? "").trim())
      .map(([k, v]) => `${k}: ${v.trim()}`);
    if (extra.length > 0) {
      const existing = typeof lead["additional_notes"] === "string" ? `${lead["additional_notes"]}\n` : "";
      lead["additional_notes"] = `${existing}${extra.join("\n")}`;
    }
  }

  // Sent flags imply a date stamp when one was not supplied.
  const pairs: [string, string][] = [
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
  ];
  for (const [flag, at] of pairs) {
    if (lead[flag] !== true) continue;
    if (!lead[at]) lead[at] = stamp(typeof lead["date_added"] === "string" ? lead["date_added"] : null) ?? new Date().toISOString();
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
