import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Buzzspear Tracker" },
      {
        name: "description",
        content: "Cold outreach pipeline, CRM and revenue tracking for the Buzzspear team.",
      },
      { property: "og:title", content: "Buzzspear Tracker" },
      {
        property: "og:description",
        content: "Cold outreach pipeline, CRM and revenue tracking for the Buzzspear team.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    void navigate({ to: session ? "/modules" : "/auth" });
  }, [loading, session, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loading label="Loading Buzzspear Tracker" />
    </div>
  );
}
