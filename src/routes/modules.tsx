import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Boxes, Columns3 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/kit";

export const Route = createFileRoute("/modules")({
  head: () => ({
    meta: [
      { title: "Choose a module — Buzzspear Tracker" },
      { name: "description", content: "Pick the Lead Tracker or the CRM module." },
      { property: "og:title", content: "Choose a module — Buzzspear Tracker" },
      { property: "og:description", content: "Pick the Lead Tracker or the CRM module." },
    ],
  }),
  component: ModulePicker,
});

function ModulePicker() {
  const { loading, session, profile, can } = useAuth();
  const navigate = useNavigate();
  const lead = can("module.lead_tracker");
  const crm = can("module.crm");

  useEffect(() => {
    if (loading) return;
    if (!session) return void navigate({ to: "/auth" });
    if (profile && !profile.is_active) return void navigate({ to: "/pending" });
    if (lead && !crm) void navigate({ to: "/lt/dashboard" });
    else if (crm && !lead) void navigate({ to: "/crm/records" });
  }, [loading, session, profile, lead, crm, navigate]);

  if (loading || !profile) return <Loading />;

  if (!lead && !crm)
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
        You have no module access yet. Ask an admin to grant access in Settings.
      </div>
    );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <div className="text-[20px] font-semibold">Buzzspear Tracker</div>
        <div className="label-text">Choose where to work</div>
      </div>
      <div className="grid w-full max-w-[720px] grid-cols-1 gap-4 sm:grid-cols-2">
        {lead && (
          <button
            onClick={() => navigate({ to: "/lt/dashboard" })}
            className="rounded-lg border border-border bg-card p-8 text-left hover:bg-subtle"
          >
            <Boxes className="size-5" />
            <div className="mt-3 text-[16px] font-medium">Lead Tracker</div>
            <div className="label-text mt-1">Cold outreach pipeline, follow-ups and daily volume</div>
          </button>
        )}
        {crm && (
          <button
            onClick={() => navigate({ to: "/crm/records" })}
            className="rounded-lg border border-border bg-card p-8 text-left hover:bg-subtle"
          >
            <Columns3 className="size-5" />
            <div className="mt-3 text-[16px] font-medium">CRM</div>
            <div className="label-text mt-1">Replied leads, deal stages, follow-ups and revenue</div>
          </button>
        )}
      </div>
    </div>
  );
}
