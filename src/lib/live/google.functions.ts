// Live chunk: google.functions-CfQ5y6E7.js (client stubs)
// Export mapping:
//   n -> getGoogleStatus      (GET,  auth)
//   r -> startGoogleConnect   (POST, auth)  { origin, returnTo } -> { url }
//   t -> disconnectGoogle     (POST, auth)
//   i -> startGoogleSignIn    (POST, no auth) { origin, plan? } -> { url }
//
// TODO(server): the live handlers run server side and are not in the client
// bundle (OAuth with Google, token storage, Drive sheet creation). These stubs
// keep the UI rendering: status reports "not connected", the start/disconnect
// calls throw a clear error.
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
  .handler(async (): Promise<GoogleStatus> => {
    // TODO(server): read the workspace's Google connection + role.
    return {
      isAdmin: true,
      usesConnectedGoogle: false,
      connected: false,
      legacy: false,
      googleEmail: null,
      sheetUrl: null,
      lastSyncAt: null,
    };
  });

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string; returnTo?: string }) => d)
  .handler(async (): Promise<{ url: string }> => {
    // TODO(server): build the Google OAuth consent URL (Drive file scope).
    throw new Error("Connect Google is not set up on this server yet.");
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true }> => {
    // TODO(server): revoke and delete the stored Google tokens.
    throw new Error("Disconnect Google is not set up on this server yet.");
  });

export const startGoogleSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { origin: string; plan?: string }) => d)
  .handler(async (): Promise<{ url: string }> => {
    // TODO(server): Google sign-in (Supabase OAuth) start URL.
    throw new Error("Google sign-in is not set up on this server yet.");
  });
