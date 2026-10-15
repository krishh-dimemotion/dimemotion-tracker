import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CloudUpload, ExternalLink, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Card, Loading } from "@/components/live/kit";
import { runSheetBackup } from "@/lib/live/sheets.functions";
import { ConnectGoogleButton, googleConnectErrorMessage, useGoogleStatus } from "@/components/live/google-connect";
import { BILLING_ACCESS_KEY, getBillingAccess } from "@/lib/live/use-subscribe";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/live/support";
import { PlanPicker } from "@/components/account/plan-picker";

type BillingSearch = { google?: string; reason?: string };

export const Route = createFileRoute("/billing")({
  validateSearch: (s: Record<string, unknown>): BillingSearch => ({
    ...(typeof s.google === "string" ? { google: s.google } : {}),
    ...(typeof s.reason === "string" ? { reason: s.reason } : {}),
  }),
  head: () => ({ meta: [{ title: "Subscription Expired | Tracker" }] }),
  component: BillingPage,
});

const BLOCKED_REASONS = ["trial_ended", "trial_lead_limit", "expired", "no_plan", "blocked", "suspended"];

type BillingAccess = {
  reason?: string | null;
  status?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  isOwner?: boolean;
};

function BillingPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { loading, session, workspace, signOut } = useAuth();
  const fetchAccess = useServerFn(getBillingAccess);
  const { data: access, isLoading } = useQuery({
    queryKey: [...BILLING_ACCESS_KEY, workspace?.id],
    queryFn: () => fetchAccess({}) as Promise<BillingAccess>,
    enabled: !!session && !!workspace,
  });

  const blocked =
    !!access &&
    (BLOCKED_REASONS.includes(access.reason ?? "") ||
      (access.status === "cancelled" &&
        !!access.current_period_end &&
        new Date(access.current_period_end).getTime() <= Date.now()));

  useEffect(() => {
    if (!loading && session && workspace && !isLoading && access && !blocked)
      void navigate({ to: "/settings", replace: true });
  }, [loading, session, workspace, isLoading, access, blocked, navigate]);

  const { data: google, refetch: refetchGoogle } = useGoogleStatus();
  const runBackup = useServerFn(runSheetBackup);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", search: { mode: "signin" } });
  }, [loading, session, navigate]);

  const backup = async () => {
    setBackingUp(true);
    try {
      await runBackup({});
      toast.success("Backed up. All your leads are in your Google Sheet.");
      await refetchGoogle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed. Please try again.");
    } finally {
      setBackingUp(false);
    }
  };

  useEffect(() => {
    if (!session || !search.google) return;
    void navigate({ to: "/billing", search: {}, replace: true });
    if (search.google === "connected") void backup();
    else toast.error(googleConnectErrorMessage(search.reason));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (loading || !session || !workspace || isLoading || !access || !blocked) return <Loading page />;

  const hasSheet = !!google?.sheetUrl;
  const reason = access.reason;
  const trialEnded =
    reason === "trial_ended" || reason === "trial_lead_limit" || reason === "expired" || reason === "no_plan";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000000] px-4 py-10 text-white">
      <div className="w-full max-w-7xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-zinc-800 bg-[#090909]">
            <Lock className="size-5 text-zinc-200" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold">Subscription Expired</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
            Your access to this workspace is paused because your trial or subscription has ended. Choose a plan to
            restore access, back up your data, or sign out.
          </p>
        </div>

        <PlanPicker
          trialEndsAt={access.trial_ends_at}
          trialEnded={trialEnded}
          isOwner={access.isOwner}
          currentPlanTitle={
            reason === "trial" ? "7-day free trial" : reason === "comped" ? "Special free access" : "Trial ended"
          }
          currentPlanKind={
            access.status === "active" || reason === "paid_until_period_end"
              ? "paid"
              : reason === "comped"
                ? "comped"
                : reason === "trial"
                  ? "trial"
                  : "expired"
          }
          currentPlanDescription={
            reason === "trial"
              ? `You are currently using Tracker during your 7-day free trial${
                  access.trial_ends_at
                    ? ` until ${new Date(access.trial_ends_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : ""
                }.`
              : reason === "comped"
                ? "This workspace has been granted special free access."
                : "Your 7-day trial has ended. Choose a paid plan to continue using Tracker."
          }
        />

        <Card className="mt-4 border-zinc-800 bg-[#050505] text-white">
          <div className="text-[14px] font-medium text-white">Back up your leads</div>
          <div className="label-text mt-1">
            Saves every lead, contact, follow-up and CRM record to a Google Sheet in your own Drive.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {hasSheet ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => void backup()} disabled={backingUp}>
                  {backingUp ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CloudUpload className="mr-2 size-4" />}
                  Back up now
                </Button>
                <Button variant="outline" asChild>
                  <a href={google?.sheetUrl ?? "#"} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 size-4" />
                    Open sheet
                  </a>
                </Button>
              </>
            ) : google?.isAdmin ? (
              <ConnectGoogleButton
                returnTo="/billing"
                label="Connect Google and back up"
                variant="outline"
                className="w-full"
              />
            ) : (
              <div className="label-text">Ask the workspace owner to back up the leads.</div>
            )}
          </div>
        </Card>

        <div className="label-text mt-6 flex items-center justify-between">
          <a className="underline" href={supportMailto("Tracker billing question")}>
            Questions? {SUPPORT_EMAIL}
          </a>
          <button
            type="button"
            className="underline"
            onClick={() => void signOut().then(() => navigate({ to: "/auth", search: { mode: "signin" } }))}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
