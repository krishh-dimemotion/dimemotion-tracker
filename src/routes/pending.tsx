import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/kit";

export const Route = createFileRoute("/pending")({
  head: () => ({
    meta: [
      { title: "Pending approval — Buzzspear Tracker" },
      { name: "description", content: "Your Buzzspear Tracker account is waiting for admin approval." },
      { property: "og:title", content: "Pending approval — Buzzspear Tracker" },
      {
        property: "og:description",
        content: "Your Buzzspear Tracker account is waiting for admin approval.",
      },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const { profile, session, loading, signOut, refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth" });
    else if (profile?.is_active) void navigate({ to: "/modules" });
  }, [loading, session, profile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-[420px] text-center">
        <div className="text-[16px] font-semibold">Your account is pending approval</div>
        <p className="label-text mt-2">
          An admin needs to activate your account and grant access before you can use the tracker.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Check again
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void signOut().then(() => navigate({ to: "/auth" }));
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
