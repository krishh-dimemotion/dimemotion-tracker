import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loading } from "@/components/live/kit";

export const Route = createFileRoute("/auth_/complete")({
  head: () => ({ meta: [{ title: "Signing in | Tracker" }] }),
  component: AuthComplete,
});

function AuthComplete() {
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = params.get("token_hash");
    window.history.replaceState(null, "", window.location.pathname);
    if (!tokenHash) {
      void navigate({ to: "/auth", search: { google_error: "failed" } });
      return;
    }
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" }).then(({ error }) => {
      if (error) {
        console.error("Google sign-in: session exchange failed", error);
        void navigate({ to: "/auth", search: { google_error: "failed" } });
        return;
      }
      void navigate({ to: "/modules" });
    });
  }, [navigate]);

  return <Loading page />;
}
