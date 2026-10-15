// Live chunk: google.functions-CfQ5y6E7.js (client stubs)
// Export mapping:
//   n -> getGoogleStatus      (GET,  auth)
//   r -> startGoogleConnect   (POST, auth)  { origin, returnTo } -> { url }
//   t -> disconnectGoogle     (POST, auth)
//   i -> startGoogleSignIn    (POST, no auth) { origin, plan? } -> { url }
//
// Google OAuth credentials are not configured on this deployment. Status
// reports "not connected" (with the real role and any saved sheet link); the
// connect / sign-in calls fail with a clear message.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GoogleStatus = {
  isAdmin: boolean;
  usesConnectedGoogle: boolean;
  connected: boolean;
  legacy: boolean;
  googleEmail: string | null;
  sheetUrl: string | null;
  lastSyncAt: string | null;
};

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleStatus> => {
    const h = await import("./server-ctx");
    const { sb, userId } = h.ctxOf(context);
    let isAdmin = false;
    let sheetUrl: string | null = null;
    try {
      const { workspaceId, role } = await h.currentWorkspace(sb, userId);
      isAdmin = h.isAdminRole(role);
      sheetUrl = (await h.readSetting<{ url?: string | null }>(sb, workspaceId, "google_sheet"))?.url ?? null;
    } catch {
      /* no workspace yet */
    }
    return {
      isAdmin,
      usesConnectedGoogle: false,
      connected: false,
      legacy: false,
      googleEmail: null,
      sheetUrl,
      lastSyncAt: null,
    };
  });

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string; returnTo?: string }) => d)
  .handler(async (): Promise<{ url: string }> => {
    throw new Error("Connecting Google is not configured on this server (no Google OAuth credentials).");
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true }> => {
    throw new Error("No Google account is connected on this server.");
  });

export const startGoogleSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { origin: string; plan?: string }) => d)
  .handler(async (): Promise<{ url: string }> => {
    throw new Error("Google sign-in is not configured on this server. Sign up with email and password instead.");
  });
