// Live chunk: config-BIY59vA0.js  (URL/handle normalisers + rapid entry config)
// Export mapping:
//   S -> CopyIcon (lucide Copy)      x -> Trash2Icon      b -> UploadIcon
//   y -> parseUrl                    m -> normalizeInstagram   h -> normalizeLinkedIn
//   g -> normalizeWebsite            v -> normalizeEmail        p -> normalizeForChannel
//   _ -> normalizeCompanyName        t -> RAPID_ENTRY_CONFIG_KEY
//   f -> useRapidEntryConfig         u -> saveRapidEntryConfig
//   r -> pickChannelForKind          a -> addDaysLocalISO
//   o -> parseInstagramInput         s -> parseLinkedInInput
//   i -> isValidEmail                n -> companyDomainFromEmail
//   c -> parseWebsiteInput           l -> defaultLeadStage
//   d -> autoStageForOutreach
import { useQuery } from "@tanstack/react-query";
import { db } from "./db";

export { Copy as CopyIcon, Trash2 as Trash2Icon, Upload as UploadIcon } from "lucide-react";

const TRACKING_PARAMS = new Set(
  "igshid.igsh.fbclid.gclid.dclid.msclkid.yclid.twclid.ttclid.li_fat_id.si.ref.ref_src.ref_url.referrer.trackingid.trk.trkinfo.lipi.licu.originalsubdomain.miniprofileurn.rcm.mc_cid.mc_eid._hsenc._hsmi.hsctatracking.__hstc.__hssc.__hsfp.hl.feature.share_id.sharer._ga._gl.mkt_tok.vero_id.oly_enc_id.oly_anon_id".split(
    ".",
  ),
);
const TRACKING_PREFIXES = ["utm_", "pk_", "mtm_", "ga_", "hsa_"];

function isTrackingParam(key: string) {
  const k = key.toLowerCase();
  return TRACKING_PARAMS.has(k) || TRACKING_PREFIXES.some((p) => k.startsWith(p));
}

export function parseUrl(value: string | null | undefined): URL | null {
  const v = (value ?? "").trim();
  if (!v || /\s/.test(v)) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withProto);
    return (u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")
      ? null
      : u;
  } catch {
    return null;
  }
}

function stripTracking(u: URL) {
  for (const k of [...u.searchParams.keys()]) if (isTrackingParam(k)) u.searchParams.delete(k);
  u.hash = "";
  return u;
}

function bareHost(u: URL) {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

const IG_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
  "legal",
  "developer",
  "web",
  "challenge",
  "emails",
  "session",
  "privacy",
  "help",
  "api",
  "tags",
]);
const IG_HANDLE = /^[a-z0-9._]{1,30}$/;

export function normalizeInstagram(value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return null;
  let handle = "";
  if (/instagram\.com|instagr\.am/i.test(v) || v.includes("/")) {
    const u = parseUrl(v);
    if (!u || !/(^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    handle = (parts[0] === "stories" ? parts[1] : parts[0]) ?? "";
  } else handle = v.replace(/^@+/, "");
  handle = decodeURIComponent(handle).trim().toLowerCase();
  return !IG_HANDLE.test(handle) || IG_RESERVED.has(handle)
    ? null
    : { url: `https://instagram.com/${handle}`, handle };
}

export function normalizeLinkedIn(value: string | null | undefined) {
  const u = parseUrl(value);
  if (!u || !/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const kind = (parts[0] ?? "").toLowerCase();
  let slug = "";
  try {
    slug = decodeURIComponent(parts[1] ?? "").trim().toLowerCase();
  } catch {
    slug = (parts[1] ?? "").trim().toLowerCase();
  }
  if (!slug) return null;
  if (kind === "in" || kind === "pub")
    return { url: `https://www.linkedin.com/in/${slug}`, kind: "person" as const, slug };
  if (kind === "company" || kind === "school" || kind === "showcase")
    return { url: `https://www.linkedin.com/company/${slug}`, kind: "company" as const, slug };
  return null;
}

export function normalizeWebsite(value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v || !/\.[a-z]{2,}(?::\d+)?(\/|\?|#|$)/i.test(v.replace(/^[a-z]+:\/\//i, ""))) return null;
  const u = parseUrl(v);
  if (!u) return null;
  stripTracking(u);
  const domain = bareHost(u);
  const port =
    u.port &&
    !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80"))
      ? `:${u.port}`
      : "";
  const path = u.pathname.replace(/\/+$/, "");
  const qs = u.searchParams.toString();
  return { url: `https://${domain}${port}${path}${qs ? `?${qs}` : ""}`, domain };
}

export function normalizeEmail(value: string | null | undefined) {
  const v = (value ?? "").trim().replace(/^mailto:/i, "");
  const at = v.lastIndexOf("@");
  if (at <= 0 || at === v.length - 1 || /\s/.test(v)) return null;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1).toLowerCase();
  return /^[^\s@]+\.[a-z]{2,}$/i.test(domain) ? `${local}@${domain}` : null;
}

export type ChannelKind = "instagram" | "linkedin" | "email" | "website";

export function normalizeForChannel(kind: ChannelKind, value: string) {
  const v = value.trim();
  return (
    v &&
    (kind === "instagram"
      ? (normalizeInstagram(v)?.url ?? v)
      : kind === "linkedin"
        ? (normalizeLinkedIn(v)?.url ?? v)
        : kind === "email"
          ? (normalizeEmail(v) ?? v)
          : (normalizeWebsite(v)?.url ?? v))
  );
}

export function normalizeCompanyName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|pvt|private|co|corp|corporation|company|gmbh|plc|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const RAPID_ENTRY_CONFIG_KEY = "rapid_entry_config";

export type FollowupDefault = "none" | string;
export type RapidEntryConfig = {
  instagram: {
    showOutreachSent: boolean;
    defaultOutreachSent: boolean;
    showReplied: boolean;
    defaultReplied: boolean;
    showSenderAccount: boolean;
    showTags: boolean;
    showFollowup: boolean;
    defaultFollowup: FollowupDefault;
  };
  linkedin: {
    showConnectionSent: boolean;
    defaultConnectionSent: boolean;
    showMessageSent: boolean;
    defaultMessageSent: boolean;
    showReplied: boolean;
    defaultReplied: boolean;
    showSenderAccount: boolean;
    showTags: boolean;
    showFollowup: boolean;
    defaultFollowup: FollowupDefault;
  };
  email: {
    showEmailSent: boolean;
    defaultEmailSent: boolean;
    showReplied: boolean;
    defaultReplied: boolean;
    showSenderAccount: boolean;
    showTags: boolean;
    showFollowup: boolean;
    defaultFollowup: FollowupDefault;
  };
};

export const DEFAULT_RAPID_ENTRY_CONFIG: RapidEntryConfig = {
  instagram: {
    showOutreachSent: true,
    defaultOutreachSent: false,
    showReplied: true,
    defaultReplied: false,
    showSenderAccount: true,
    showTags: true,
    showFollowup: true,
    defaultFollowup: "none",
  },
  linkedin: {
    showConnectionSent: true,
    defaultConnectionSent: false,
    showMessageSent: true,
    defaultMessageSent: false,
    showReplied: true,
    defaultReplied: false,
    showSenderAccount: true,
    showTags: true,
    showFollowup: true,
    defaultFollowup: "none",
  },
  email: {
    showEmailSent: true,
    defaultEmailSent: false,
    showReplied: true,
    defaultReplied: false,
    showSenderAccount: true,
    showTags: true,
    showFollowup: true,
    defaultFollowup: "none",
  },
};

function mergeRapidConfig(value: unknown): RapidEntryConfig {
  const v = (value && typeof value === "object" ? value : {}) as Partial<RapidEntryConfig>;
  return {
    instagram: { ...DEFAULT_RAPID_ENTRY_CONFIG.instagram, ...(v.instagram ?? {}) },
    linkedin: { ...DEFAULT_RAPID_ENTRY_CONFIG.linkedin, ...(v.linkedin ?? {}) },
    email: { ...DEFAULT_RAPID_ENTRY_CONFIG.email, ...(v.email ?? {}) },
  };
}

export function useRapidEntryConfig() {
  return useQuery({
    queryKey: ["app_settings", RAPID_ENTRY_CONFIG_KEY],
    queryFn: async () => {
      const { data, error } = await db
        .from("app_settings")
        .select("value")
        .eq("key", RAPID_ENTRY_CONFIG_KEY)
        .maybeSingle();
      if (error) throw error;
      return mergeRapidConfig(data?.value);
    },
  });
}

export async function saveRapidEntryConfig(value: RapidEntryConfig) {
  const { error } = await db
    .from("app_settings")
    .upsert({ key: RAPID_ENTRY_CONFIG_KEY, value }, { onConflict: "workspace_id,key" });
  if (error) throw error;
}

type ChannelLike = { name: string; kind?: string | null; is_active?: boolean | null };

export function pickChannelForKind<T extends ChannelLike>(channels: T[] | null | undefined, kind: string) {
  const all = channels ?? [];
  const ofKind = all.filter((c) => c.kind === kind);
  return (
    ofKind.find((c) => c.is_active !== false) ??
    ofKind[0] ??
    all.find((c) => c.name.toLowerCase().includes(kind))
  );
}

export function addDaysLocalISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 10);
}

export function parseInstagramInput(value: string) {
  const ig = normalizeInstagram(value);
  if (ig) return { url: ig.url, handle: `@${ig.handle}` };
  const u = /instagram\.com|instagr\.am/i.test(value) ? parseUrl(value) : null;
  return u ? { url: stripTracking(u).toString(), handle: "" } : null;
}

function titleFromSlug(slug: string) {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .filter((w, i, arr) => !(i === arr.length - 1 && arr.length > 1 && /\d/.test(w)))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function parseLinkedInInput(value: string) {
  const li = normalizeLinkedIn(value);
  if (li?.kind === "person") return { url: li.url, personName: titleFromSlug(li.slug), companyName: "" };
  if (li?.kind === "company") return { url: li.url, personName: "", companyName: titleFromSlug(li.slug) };
  const u = parseUrl(value);
  return u ? { url: stripTracking(u).toString(), personName: "", companyName: "" } : null;
}

export function isValidEmail(value: string) {
  return normalizeEmail(value) !== null;
}

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
]);

export function companyDomainFromEmail(email: string) {
  const d = email.trim().split("@")[1]?.toLowerCase() ?? "";
  return d && !FREE_MAIL.has(d) ? d : "";
}

export function parseWebsiteInput(value: string) {
  const w = normalizeWebsite(value);
  return w ? { url: w.url, host: w.domain } : null;
}

export type StageLike = {
  id: string;
  name: string;
  order_index: number;
  board?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  is_archived?: boolean | null;
  is_reply_stage?: boolean | null;
};

export function defaultLeadStage<T extends StageLike>(stages: T[] | null | undefined) {
  const open = (stages ?? [])
    .filter((s) => (s.board ?? "lead") === "lead" && !s.is_won && !s.is_lost && !s.is_archived)
    .sort((a, b) => a.order_index - b.order_index);
  return open.find((s) => /^new\b/i.test(s.name.trim())) ?? open[0];
}

const SENT_FLAGS = ["email_sent", "linkedin_sent", "instagram_sent", "linkedin_connection_sent"];
const REPLY_FLAGS = ["email_replied", "linkedin_replied", "instagram_replied"];

/** Stage a lead should move to after an outreach/reply flag is ticked, or null to stay put. */
export function autoStageForOutreach<T extends StageLike>(
  stages: T[] | null | undefined,
  currentStageId: string | null | undefined,
  patch: Record<string, unknown>,
): T | null {
  const replied = REPLY_FLAGS.some((k) => patch[k] === true);
  const sent = SENT_FLAGS.some((k) => patch[k] === true);
  if (!replied && !sent) return null;
  const lead = (stages ?? [])
    .filter((s) => (s.board ?? "lead") === "lead" && !s.is_archived)
    .sort((a, b) => a.order_index - b.order_index);
  const target = replied
    ? (lead.find((s) => s.is_reply_stage) ?? lead.find((s) => /^repl/i.test(s.name.trim())))
    : lead.find((s) => /^contact/i.test(s.name.trim()));
  if (!target) return null;
  const current = lead.find((s) => s.id === currentStageId);
  return (current && (current.is_won || current.is_lost)) ||
    (current && current.order_index >= target.order_index)
    ? null
    : target;
}

// Aliases used by parallel ports.
export { autoStageForOutreach as autoAdvanceStage, normalizeForChannel as normalizeContactValue, parseUrl as toUrl };
