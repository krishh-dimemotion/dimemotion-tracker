import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const SETTINGS_KEY = "google_sheet_backup";
const TAB = "Leads";

type SheetSettings = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  lastSyncedAt: string | null;
  lastRowCount: number;
};

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google Sheets is not connected for this project yet.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function gateway(path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: init?.method ?? "GET",
    headers: gatewayHeaders(),
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Google Sheets request failed [${res.status}]: ${text}`);
    throw new Error(`Google Sheets request failed [${res.status}]: ${text}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

const HEADERS = [
  "Lead code",
  "Company",
  "Primary contact",
  "Country",
  "Stage",
  "Status",
  "Priority",
  "Channel",
  "Sender account",
  "Date added",
  "Website",
  "Company LinkedIn",
  "Instagram",
  "YouTube",
  "Email sent",
  "Email sent at",
  "Email viewed",
  "Email replied",
  "Reply sentiment",
  "Reply channel",
  "LinkedIn connection sent",
  "LinkedIn message sent",
  "LinkedIn replied",
  "Instagram sent",
  "Instagram replied",
  "Loom URL",
  "Loom sent",
  "Loom watched",
  "Loom watch %",
  "Meeting booked",
  "Client closed",
  "Last contacted",
  "Next follow-up",
  "Pushed to CRM",
  "Archived",
  "Research notes",
  "Additional notes",
  "Created at",
  "Updated at",
];

type Row = Record<string, unknown>;

function yn(v: unknown) {
  return v === true ? "Yes" : v === false ? "No" : "";
}
function day(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}
function name(v: unknown) {
  if (v && typeof v === "object" && "name" in (v as Row)) return String((v as Row)["name"] ?? "");
  return "";
}
function s(v: unknown) {
  return v === null || v === undefined ? "" : String(v);
}

function toRow(l: Row): string[] {
  return [
    s(l["lead_code"]),
    s(l["company_name"]),
    s(l["primary_contact"]),
    name(l["countries"]),
    name(l["stages"]),
    s(l["status"]),
    s(l["priority"]),
    name(l["channel"]),
    name(l["sender_accounts"]) || s((l["sender_accounts"] as Row | null)?.["label"]),
    day(l["date_added"]),
    s(l["website_url"]),
    s(l["company_linkedin_url"]),
    s(l["instagram_url"]),
    s(l["youtube_url"]),
    yn(l["email_sent"]),
    day(l["email_sent_at"]),
    yn(l["email_viewed"]),
    yn(l["email_replied"]),
    s(l["reply_sentiment"]),
    name(l["reply_channel"]),
    yn(l["linkedin_connection_sent"]),
    yn(l["linkedin_sent"]),
    yn(l["linkedin_replied"]),
    yn(l["instagram_sent"]),
    yn(l["instagram_replied"]),
    s(l["loom_url"]),
    yn(l["loom_sent"]),
    yn(l["loom_watched"]),
    s(l["loom_watch_percent"]),
    yn(l["meeting_booked"]),
    yn(l["client_closed"]),
    day(l["last_contacted_at"]),
    day(l["next_followup_date"]),
    yn(l["pushed_to_crm"]),
    yn(l["archived"]),
    s(l["research_notes"]),
    s(l["additional_notes"]),
    day(l["created_at"]),
    day(l["updated_at"]),
  ];
}

const SELECT = `*, countries(name), stages(name), channel:channels!leads_channel_id_fkey(name), reply_channel:channels!leads_reply_channel_id_fkey(name), sender_accounts(label)`;

async function readSettings(): Promise<SheetSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  return (value as SheetSettings | undefined) ?? null;
}

async function writeSettings(value: SheetSettings) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value } as never, { onConflict: "key" });
}

export const getSheetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const connected = Boolean(process.env["LOVABLE_API_KEY"] && process.env["GOOGLE_SHEETS_API_KEY"]);
    return { connected, sheet: await readSettings() };
  });

export const syncLeadsToSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("leads")
      .select(SELECT)
      .order("date_added", { ascending: false });
    if (error) throw new Error(error.message);
    const leads = (data ?? []) as unknown as Row[];

    let settings = await readSettings();

    if (!settings?.spreadsheetId) {
      const created = await gateway("/spreadsheets", {
        method: "POST",
        body: {
          properties: { title: "Buzzspear Tracker — Leads backup" },
          sheets: [{ properties: { title: TAB } }],
        },
      });
      settings = {
        spreadsheetId: String(created["spreadsheetId"]),
        spreadsheetUrl: String(created["spreadsheetUrl"] ?? ""),
        lastSyncedAt: null,
        lastRowCount: 0,
      };
    }

    const values = [HEADERS, ...leads.map(toRow)];

    await gateway(`/spreadsheets/${settings.spreadsheetId}/values/${TAB}!A:BZ:clear`, {
      method: "POST",
      body: {},
    });
    await gateway(
      `/spreadsheets/${settings.spreadsheetId}/values/${TAB}!A1?valueInputOption=RAW`,
      { method: "PUT", body: { range: `${TAB}!A1`, majorDimension: "ROWS", values } },
    );

    const next: SheetSettings = {
      ...settings,
      lastSyncedAt: new Date().toISOString(),
      lastRowCount: leads.length,
    };
    await writeSettings(next);
    return next;
  });
