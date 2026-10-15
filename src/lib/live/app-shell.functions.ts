// Server functions referenced by the live app-shell chunk.
//   emailLeadProfile  (c46364f0...)  "Export > Email to me" on a lead page
//   reportProblem     (5a384742...)  Report a bug / Submit feedback dialogs
//   updateLeadEvent   (4462329f...)  edit an activity entry
//   deleteLeadEvent   (836a52ca...)  delete an activity entry
// The live handlers are not in the client bundle. updateLeadEvent and
// deleteLeadEvent are reimplemented from how the client calls them (label kept
// in meta.label, meta.edited set on edit). The two mail senders are TODO.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

export const emailLeadProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => d)
  .handler(async (): Promise<{ recipient: string }> => {
    // TODO(server): render the lead profile and email it to the caller.
    throw new Error("Emailing a lead profile is not set up on this server yet.");
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
  .handler(async ({ data }) => {
    // TODO(server): the live handler emails support (with the screenshot attached).
    console.warn("[report-problem]", data.page, data.message.slice(0, 200));
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
