// Untyped Supabase handle for the live schema.
// The generated types in src/integrations/supabase/types.ts predate the live
// database (workspaces, app_settings, outreach_templates, ...), so live ports
// query through this loosely typed alias until the types are regenerated.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<any, "public", any>;
