import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/kit";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Buzzspear Tracker" },
      { name: "description", content: "Sign in to the Buzzspear outreach and CRM tracker." },
      { property: "og:title", content: "Sign in — Buzzspear Tracker" },
      { property: "og:description", content: "Sign in to the Buzzspear outreach and CRM tracker." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/modules" });
  }, [loading, session, navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    void navigate({ to: "/modules" });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/modules`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Check your email if confirmation is required.");
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return toast.error("Google sign in failed");
    if (result.redirected) return;
    void navigate({ to: "/modules" });
  };

  const reset = async () => {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <div className="text-[20px] font-semibold">Buzzspear Tracker</div>
          <div className="label-text">Outreach, CRM and revenue in one place</div>
        </div>
        <Card>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form className="space-y-3 pt-3" onSubmit={signIn}>
                <div className="space-y-1">
                  <Label className="text-[12px]">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-[12px]">Password</Label>
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    required
                  />
                </div>
                <Button className="w-full" disabled={busy} type="submit">
                  Sign in
                </Button>
                <button type="button" onClick={reset} className="label-text w-full text-center underline">
                  Forgot password
                </button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form className="space-y-3 pt-3" onSubmit={signUp}>
                <div className="space-y-1">
                  <Label className="text-[12px]">Full name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-[12px]">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-[12px]">Password</Label>
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    minLength={6}
                    required
                  />
                </div>
                <Button className="w-full" disabled={busy} type="submit">
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="mt-4 border-t border-border pt-4">
            <Button variant="outline" className="w-full" onClick={google}>
              Continue with Google
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
