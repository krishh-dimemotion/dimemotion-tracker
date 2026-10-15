import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/live/kit";
import { IS_TEST_MODE } from "@/lib/live/test-mode";
import { startGoogleSignIn } from "@/lib/live/google.functions";

type AuthSearch = { mode?: "signin"; google_error?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    ...(s.mode === "signin" ? { mode: "signin" as const } : {}),
    ...(typeof s.google_error === "string" ? { google_error: s.google_error } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Get started | Tracker" },
      { name: "description", content: "Create your outreach, CRM and revenue tracker account." },
      { property: "og:title", content: "Get started | Tracker" },
      { property: "og:description", content: "Create your outreach, CRM and revenue tracker account." },
    ],
  }),
  component: AuthPage,
});

function TrackerMark() {
  return (
    <svg viewBox="0 0 64 64" className="mx-auto size-11" aria-hidden="true">
      <rect width="64" height="64" rx="12" fill="#111111" />
      <path d="M16 17h32v9H37v25H27V26H16z" fill="#ffffff" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { mode, google_error: googleError } = Route.useSearch();
  const formMode = mode === "signin" ? "signin" : "signup";
  const isSignup = formMode === "signup";
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const afterAuth = () =>
    navigate({ to: "/modules" });

  useEffect(() => {
    if (!loading && session) void afterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    void afterAuth();
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth?mode=signin`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Check your email if confirmation is required.");
  };

  const googleStart = useServerFn(startGoogleSignIn);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (!googleError) return;
    toast.error(
      googleError === "cancelled"
        ? "Google sign in was cancelled."
        : googleError === "expired"
          ? "That took too long. Please try again."
          : "Google sign in didn't work. Please try again.",
    );
    void navigate({
      to: "/auth",
      search: { ...(mode ? { mode } : {}) },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleError]);

  const google = async () => {
    setGoogleBusy(true);
    try {
      const { url } = await googleStart({
        data: { origin: window.location.origin },
      });
      window.location.assign(url);
    } catch {
      setGoogleBusy(false);
      toast.error("Google sign in failed. Please try again.");
    }
  };

  const reset = async () => {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=signin`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <TrackerMark />
          <div className="mt-4 text-[20px] font-semibold">
            {isSignup ? "Create your Tracker account" : "Welcome back"}
          </div>
          <div className="label-text mt-1">
            {isSignup ? "Outreach, CRM and revenue in one place" : "Sign in to your Tracker account"}
          </div>
        </div>
        <Card>
          {!IS_TEST_MODE && (
            <>
              <Button variant="outline" className="w-full gap-2" onClick={google} type="button" disabled={googleBusy}>
                <GoogleIcon />
                Continue with Google
              </Button>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="label-text">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form key={formMode} className="space-y-3" onSubmit={isSignup ? signUp : signIn}>
            {isSignup && (
              <div className="space-y-1">
                <Label className="text-[12px]">Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-[12px]">Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px]">Password</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={isSignup ? 6 : undefined}
                required
              />
            </div>
            <Button className="w-full" disabled={busy} type="submit">
              {isSignup ? "Create account" : "Sign in"}
            </Button>
            {!isSignup && (
              <button type="button" onClick={reset} className="label-text w-full text-center underline">
                Forgot password
              </button>
            )}
          </form>
        </Card>
        <div className="label-text mt-5 text-center">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="font-medium text-foreground underline"
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here? Don't have an account?{" "}
              <Link to="/auth" search={{}} className="font-medium text-foreground underline">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
