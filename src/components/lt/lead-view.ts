// Ported from live chunk lead-view-DPL3lg7f.js
export { Download as DownloadIcon } from "lucide-react";

export const LEAD_VIEW_STORAGE_KEY = "lt.leads.view";

/** Maps the profile's default_lead_view setting to a Leads page view. */
export function viewFromProfileDefault(v: string | null | undefined): "table" | "columns" | "cards" {
  return v === "board" ? "columns" : v === "cards" ? "cards" : "table";
}
