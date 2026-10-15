// Shared helpers for server function handlers. Only call these from inside
// createServerFn(...).handler bodies (server side).
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, "public", any>;

export function ctxOf(context: unknown) {
  const c = context as { supabase: AnyClient; userId: string };
  return { sb: c.supabase, userId: c.userId };
}

export async function adminClient(): Promise<AnyClient> {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin as unknown as AnyClient;
}

/** The caller's current workspace id and their role in it. */
export async function currentWorkspace(sb: AnyClient, userId: string) {
  const { data: prof, error } = await sb
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  let wsId = (prof?.current_workspace_id as string | null) ?? null;
  let role: string | null = null;
  if (wsId) {
    const { data: m } = await sb
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", wsId)
      .eq("user_id", userId)
      .maybeSingle();
    role = (m?.role as string | undefined) ?? null;
  }
  if (!wsId || !role) {
    const { data: m } = await sb
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    wsId = (m?.workspace_id as string | undefined) ?? null;
    role = (m?.role as string | undefined) ?? null;
  }
  if (!wsId) throw new Error("You are not in a workspace yet.");
  return { workspaceId: wsId, role: role ?? "member" };
}

export const isAdminRole = (r: string | null | undefined) => r === "owner" || r === "admin";

/** Every workspace-scoped data table, children first (delete order). */
export const WORKSPACE_TABLES = [
  "crm_contact_log",
  "crm_records",
  "lead_tasks",
  "lead_tags",
  "lead_links",
  "lead_contacts",
  "lead_followups",
  "lead_events",
  "leads",
  "outreach_daily",
  "outreach_targets",
  "outreach_templates",
  "followup_templates",
  "import_mappings",
  "sender_accounts",
  "tags",
  "stages",
  "channels",
  "countries",
  "shortcuts",
  "app_settings",
] as const;

export async function readSetting<T>(sb: AnyClient, workspaceId: string, key: string): Promise<T | null> {
  const { data } = await sb
    .from("app_settings")
    .select("value")
    .eq("workspace_id", workspaceId)
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

export async function writeSetting(sb: AnyClient, workspaceId: string, key: string, value: unknown) {
  const { error } = await sb
    .from("app_settings")
    .upsert({ workspace_id: workspaceId, key, value }, { onConflict: "workspace_id,key" });
  if (error) throw new Error(error.message);
}
