import { supabase } from "@/integrations/supabase/client";

export const ONBOARDING_VIDEOS = [
  { id: "ybDHBMHGxdM", title: "How to Track and Manage Leads" },
  { id: "K8_2j0QA6pM", title: "Using the CRM and Revenue Dashboard" },
  { id: "EgTZrRNRA-M", title: "Setting Up and Customizing Your Workspace" },
];

/** A new owner with an empty workspace is sent to /welcome first. */
export async function needsOnboarding(opts: { onboarded?: boolean; role?: string }) {
  if (opts.onboarded || opts.role !== "owner") return false;
  const { count, error } = await supabase.from("leads").select("id", { count: "exact", head: true });
  return !error && (count ?? 0) === 0;
}

export async function markOnboarded() {
  await supabase.auth.updateUser({ data: { onboarded: true } });
}
