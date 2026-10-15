import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Boxes, Columns3 } from "lucide-react";
import { useAuth } from "@/lib/live/auth";
import { Loading } from "@/components/live/kit";
import { NoWorkspace } from "@/components/live/workspace-switcher";
import { getPendingInvite } from "@/components/account/pending-invite";
import { needsOnboarding } from "@/components/account/onboarding";

export const Route = createFileRoute("/modules")({
  head: () => ({
    meta: [
      { title: "Choose a module | Tracker" },
      { name: "description", content: "Pick the Lead Tracker or the CRM module." },
      { property: "og:title", content: "Choose a module | Tracker" },
      { property: "og:description", content: "Pick the Lead Tracker or the CRM module." },
    ],
  }),
  component: ModulePicker,
});

const cardClass =
  "group pro-card pressable flex flex-col gap-4 p-6 text-left transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-float";

function ModulePicker() {
  // NOTE: live useAuth exposes `workspace` ({ id, name, role }).
  const { loading, session, user, profile, workspace, can } = useAuth();
  const navigate = useNavigate();
  const lead = can("module.lead_tracker");
  const crm = can("module.crm");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) return void navigate({ to: "/auth" });
    const invite = getPendingInvite();
    if (invite) return void navigate({ to: "/invite/$token", params: { token: invite } });
    if (profile && !workspace) return;
    let cancelled = false;
    void needsOnboarding({ onboarded: user?.user_metadata?.onboarded, role: workspace?.role }).then((onboard) => {
      if (cancelled) return;
      if (onboard) return void navigate({ to: "/welcome" });
      if (lead && !crm) return void navigate({ to: "/lt/dashboard" });
      if (crm && !lead) return void navigate({ to: "/crm/records" });
      if (lead && crm)
        return void navigate({ to: profile?.default_module === "crm" ? "/crm/records" : "/lt/dashboard" });
      setShowPicker(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, session, user, profile, workspace, lead, crm, navigate]);

  if (loading || !profile) return <Loading page />;
  if (!workspace) return <NoWorkspace />;
  if (!showPicker) return <Loading page />;

  if (!lead && !crm)
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
        You have no module access yet. Ask an admin to grant access in Settings.
      </div>
    );

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-background px-4 py-12">
      <div className="relative text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-foreground text-background shadow-float">
          <span className="text-[18px] font-bold tracking-tight">T</span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">Where do you want to work?</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Switch any time from the sidebar, or with Ctrl/Cmd + 1 and 2.
        </p>
      </div>
      <div className="relative grid w-full max-w-[760px] grid-cols-1 gap-4 sm:grid-cols-2">
        {lead && (
          <button onClick={() => navigate({ to: "/lt/dashboard" })} className={cardClass}>
            <span className="grid size-11 place-items-center rounded-xl bg-foreground text-background">
              <Boxes className="size-5" strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-[17px] font-semibold tracking-tight">Lead Tracker</span>
              <span className="mt-1 block text-[13px] text-muted-foreground">
                Cold outreach pipeline, follow-ups and daily volume
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
              Open Lead Tracker
              <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </button>
        )}
        {crm && (
          <button onClick={() => navigate({ to: "/crm/records" })} className={cardClass}>
            <span className="grid size-11 place-items-center rounded-xl bg-foreground text-background">
              <Columns3 className="size-5" strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-[17px] font-semibold tracking-tight">CRM</span>
              <span className="mt-1 block text-[13px] text-muted-foreground">
                Replied leads, deal stages, follow-ups and revenue
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
              Open CRM
              <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
