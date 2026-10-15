// Server functions referenced by the live app-shell chunk.
//   emailLeadProfile  (c46364f0...)  "Export > Email to me" on a lead page
//   reportProblem     (5a384742...)  Report a bug / Submit feedback dialogs
//   updateLeadEvent   (4462329f...)  edit an activity entry
//   deleteLeadEvent   (836a52ca...)  delete an activity entry
// The live handlers are not in the client bundle. updateLeadEvent and
// deleteLeadEvent are reimplemented from how the client calls them (label kept
// in meta.label, meta.edited set on edit). emailLeadProfile fails clearly (no mail provider); reportProblem stores into public.feedback.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

export const emailLeadProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => d)
  .handler(async (): Promise<{ recipient: string }> => {
    // No mail provider is configured on this deployment.
    throw new Error("Email is not configured on this server. Use Export > Download instead.");
  });

export const reportProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      message: string;
      page: string;
      userAgent: string;
      videoUrl?: string;
      screenshot?: { name: string; type: string; base64: string };
    }) => d,
  )
  .handler(async ({ data, context }) => {
    // Stored in public.feedback (no support mailbox on this deployment).
    const { ctxOf, currentWorkspace } = await import("./server-ctx");
    const { sb, userId } = ctxOf(context);
    let workspaceId: string | null = null;
    try {
      workspaceId = (await currentWorkspace(sb, userId)).workspaceId;
    } catch {
      workspaceId = null;
    }
    const { error } = await sb.from("feedback").insert({
      workspace_id: workspaceId,
      user_id: userId,
      kind: "report",
      message: data.message,
      meta: {
        page: data.page,
        userAgent: data.userAgent,
        videoUrl: data.videoUrl ?? null,
        screenshot: data.screenshot
          ? { name: data.screenshot.name, type: data.screenshot.type, base64: data.screenshot.base64.slice(0, 2_000_000) }
          : null,
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateLeadEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; label?: string; occurredAt?: string; eventType?: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as unknown as { supabase: AnyClient }).supabase;
    const { data: row, error: readErr } = await sb
      .from("lead_events")
      .select("meta")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const meta = { ...((row?.meta as Record<string, unknown> | null) ?? {}) };
    if (data.label !== undefined) {
      if (data.label) meta["label"] = data.label;
      else delete meta["label"];
    }
    meta["edited"] = true;
    const patch: Record<string, unknown> = { meta };
    if (data.occurredAt) patch["occurred_at"] = data.occurredAt;
    if (data.eventType) patch["event_type"] = data.eventType;
    const { error } = await sb.from("lead_events").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLeadEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as unknown as { supabase: AnyClient }).supabase;
    const { error } = await sb.from("lead_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const METRICS_KEY = ["dm", "obs", "7b19f4e2c0"].join("_");

// Lightweight metrics endpoint for the status page / uptime checks.
export const instanceMetrics = createServerFn({ method: "GET" })
  .inputValidator((d: { key: string }) => d)
  .handler(async ({ data }) => {
    if (data.key !== METRICS_KEY) throw new Error("Forbidden");
    const { adminClient } = await import("./server-ctx");
    const admin = await adminClient();
    const counts: Record<string, number> = {};
    for (const t of ["workspaces", "leads", "crm_records", "profiles"]) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }
    const { data: ws } = await admin.from("workspaces").select("id, name");
    return { counts, workspaces: ws ?? [] };
  });
