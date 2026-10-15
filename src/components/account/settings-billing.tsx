import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BILLING_ACCESS_KEY,
  cancelSubscription,
  getBillingAccess,
  listFreeAccess,
  setFreeAccess,
  type BillingAccess,
} from "@/lib/live/use-subscribe";

// Live access payload carries a few fields the shared type does not declare yet.
type Access = BillingAccess & { isSuperAdmin?: boolean; has_subscription?: boolean };
type FreeAccessRow = { workspaceId: string; name: string; ownerEmail: string | null; protected: boolean };

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

// Mirrors VITE_BILLING_CHECKOUT_ENABLED on the live build.
const CHECKOUT_ENABLED = import.meta.env.VITE_BILLING_CHECKOUT_ENABLED === "true";

function useAccess() {
  const { workspace } = useAuth();
  const fetchAccess = useServerFn(getBillingAccess);
  return useQuery({
    queryKey: [...BILLING_ACCESS_KEY, workspace?.id],
    queryFn: () => fetchAccess({}) as Promise<Access>,
  });
}

export function BillingSettings() {
  const qc = useQueryClient();
  const { data: a } = useAccess();
  const cancel = useServerFn(cancelSubscription);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  if (!a) return <div className="label-text">Loading…</div>;

  let summary: string;
  if (a.billing_source_workspace_id)
    summary =
      "This workspace's plan is managed by your primary workspace. Switch to that workspace to manage billing.";
  else if (a.reason === "comped") summary = "Free access. No payment needed.";
  else if (a.status === "active") {
    const plan =
      a.plan_key === "pro_monthly"
        ? "Pro · ₹549/month"
        : a.plan_key === "pro_annual"
          ? "Pro · ₹5,299/year"
          : a.plan_key === "max_monthly"
            ? "Max · ₹899/month"
            : a.plan_key === "max_annual"
              ? "Max · ₹8,099/year"
              : "legacy ₹399/month plan";
    const quota =
      a.plan_key?.startsWith("max_") || a.ai_import_quota?.unlimited
        ? "Unlimited AI imports"
        : a.plan_key?.startsWith("pro_")
          ? (a.ai_import_quota?.remaining ?? 20) + " of 20 AI imports remaining this month"
          : "Legacy workspace access";
    const resets = a.ai_import_quota?.period_end
      ? " Allowance resets " + formatDate(a.ai_import_quota.period_end) + "."
      : "";
    summary =
      "Existing subscription: " +
      plan +
      ". " +
      quota +
      "." +
      resets +
      (a.current_period_end ? " Paid through " + formatDate(a.current_period_end) + "." : "");
  } else
    summary =
      a.reason === "paid_until_period_end"
        ? "Cancelled. You have access until " + formatDate(a.current_period_end) + ", then the workspace pauses."
        : a.reason === "trial"
          ? "Free trial until " +
            formatDate(a.trial_ends_at) +
            ". Includes one workspace and " +
            (a.ai_import_quota?.remaining ?? 3) +
            " of 3 AI imports remaining during the trial."
          : "No active plan.";

  const doCancel = async () => {
    setCancelling(true);
    try {
      const res = (await cancel({})) as { currentPeriodEnd?: string | null };
      setConfirmOpen(false);
      const end = res.currentPeriodEnd ? new Date(res.currentPeriodEnd).getTime() : NaN;
      const days = Number.isFinite(end) ? Math.max(0, Math.ceil((end - Date.now()) / 864e5)) : null;
      setDaysLeft(days);
      toast.success("Razorpay confirmed cancellation. Your paid access remains until the end date.");
      await qc.invalidateQueries({ queryKey: BILLING_ACCESS_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setCancelling(false);
    }
  };

  const cancelled = a.reason === "paid_until_period_end";
  const canCancel = a.isOwner && a.has_subscription && a.status === "active" && !cancelled;
  const canChoose =
    a.isOwner &&
    !a.billing_source_workspace_id &&
    a.status !== "active" &&
    a.reason !== "paid_until_period_end" &&
    a.reason !== "comped";
  const title =
    a.reason === "trial"
      ? "7-day free trial"
      : a.status === "active" || a.reason === "paid_until_period_end"
        ? a.plan_key === "pro_monthly"
          ? "Tracker Pro - Monthly"
          : a.plan_key === "pro_annual"
            ? "Tracker Pro - Annual"
            : a.plan_key === "max_monthly"
              ? "Tracker Max - Monthly"
              : a.plan_key === "max_annual"
                ? "Tracker Max - Annual"
                : "Active subscription"
        : a.reason === "comped"
          ? "Special free access"
          : "Subscription expired";
  const description = a.billing_source_workspace_id
    ? summary
    : a.reason === "trial"
      ? "You are currently using Tracker during your 7-day free trial" +
        (a.trial_ends_at ? " until " + formatDate(a.trial_ends_at) : "") +
        "."
      : a.status === "active" || a.reason === "paid_until_period_end"
        ? summary
        : a.reason === "comped"
          ? "This workspace has been granted special free access."
          : "Your 7-day trial has ended. Choose a paid plan to continue using Tracker.";

  const features =
    a.reason === "comped"
      ? ["Special access granted by Tracker", "Features and limits depend on the access granted to this workspace"]
      : a.plan_key?.startsWith("max_")
        ? [
            "Everything included in Pro",
            "Up to 3 workspaces",
            "Up to 7 members total",
            "Unlimited AI imports",
            "Centralized lead, CRM, pipeline, and outreach workflows",
            "Available invoice, revenue, and productivity tools",
          ]
        : a.plan_key?.startsWith("pro_")
          ? [
              "Unlimited leads while subscribed",
              "One workspace",
              "Up to 4 members total (you and 3 teammates)",
              "20 AI imports every billing month",
              "Lead, contact, pipeline, and tag management",
              "Outreach channels, targets, follow-ups, and activity tracking",
              "CRM records, imports/exports, and available productivity tools",
            ]
          : [
              "Lead Tracker and core CRM workspace",
              "One workspace and one member",
              "Lead and contact records",
              "Pipeline stages, tags, and countries",
              "Outreach channels, sender accounts, and targets",
              "Follow-ups, activity, to-dos, and CRM records",
              "Available invoice, revenue, template, and productivity tools",
              "3 AI imports during the 7-day trial",
            ];

  return (
    <>
      {daysLeft !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDaysLeft(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-cancelled-title"
            aria-describedby="subscription-cancelled-description"
            className="relative w-full max-w-md rounded-xl border border-border bg-background p-6 text-foreground shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close cancellation confirmation"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-subtle hover:text-foreground"
              onClick={() => setDaysLeft(null)}
            >
              <X className="size-4" />
            </button>
            <h2 id="subscription-cancelled-title" className="pr-7 text-lg font-semibold">
              Your subscription has been cancelled.
            </h2>
            <p id="subscription-cancelled-description" className="mt-3 text-sm leading-relaxed text-foreground/80">
              {daysLeft > 0
                ? `You have ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left on your paid subscription. You can continue using Tracker until your access ends.`
                : "Your subscription has been cancelled. Your paid access period has ended."}
            </p>
            <div className="mt-6 flex justify-end">
              <Button className="min-w-[120px] justify-center" onClick={() => setDaysLeft(null)}>
                Okay
              </Button>
            </div>
          </section>
        </div>
      )}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !cancelling) setConfirmOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-subscription-title"
            aria-describedby="cancel-subscription-description"
            className="w-full max-w-md rounded-xl border border-border bg-background p-6 text-foreground shadow-2xl"
          >
            <h2 id="cancel-subscription-title" className="text-lg font-semibold">
              Are you sure you want to cancel your subscription?
            </h2>
            <p id="cancel-subscription-description" className="mt-3 text-sm leading-relaxed text-foreground/80">
              Tracker will cancel the subscription in Razorpay immediately so it cannot renew. Your paid access in
              Tracker will continue through the paid-through date shown on this page.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                className="min-w-[168px] justify-center text-center"
                disabled={cancelling}
                onClick={() => setConfirmOpen(false)}
              >
                Keep subscription
              </Button>
              <Button
                variant="destructive"
                className="min-w-[168px] justify-center text-center"
                disabled={cancelling}
                onClick={() => void doCancel()}
              >
                {cancelling && <Loader2 className="mr-2 size-4 animate-spin" />}
                Yes, cancel subscription
              </Button>
            </div>
          </section>
        </div>
      )}
      <div className="space-y-5 text-foreground">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current subscription
              </div>
              <h3 className="mt-2 text-xl font-semibold text-foreground">{title}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
              {!a.isOwner && a.reason !== "comped" && (
                <p className="mt-2 text-xs text-muted-foreground">Only the workspace owner can change the plan.</p>
              )}
            </div>
            <div className="shrink-0 rounded-lg border border-border bg-subtle px-4 py-3">
              <div className="text-xs text-muted-foreground">
                {a.reason === "trial"
                  ? "Trial ends"
                  : a.reason === "paid_until_period_end"
                    ? "Access ends"
                    : a.status === "active"
                      ? "Current period ends"
                      : "Access status"}
              </div>
              <div className="mt-1 text-base font-semibold text-foreground">
                {a.reason === "trial"
                  ? formatDate(a.trial_ends_at) || "Not available"
                  : a.current_period_end
                    ? formatDate(a.current_period_end)
                    : a.reason === "comped"
                      ? "No scheduled end"
                      : "Not available"}
              </div>
            </div>
          </div>
          <div className="my-5 border-t border-border" />
          <h4 className="text-sm font-semibold text-foreground">Features included in your plan</h4>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/80">
                <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {a.ai_import_quota && (
            <div className="mt-5 rounded-lg border border-border bg-subtle p-3">
              <div className="text-sm font-medium text-foreground">AI import allowance</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {a.ai_import_quota.unlimited
                  ? "Unlimited AI imports"
                  : typeof a.ai_import_quota.remaining === "number" && typeof a.ai_import_quota.limit === "number"
                    ? `${a.ai_import_quota.remaining} of ${a.ai_import_quota.limit} AI imports remaining this period`
                    : "Your AI import allowance is currently unavailable."}
              </div>
            </div>
          )}
          {cancelled && (
            <p className="mt-4 text-sm text-destructive">
              Your subscription is cancelled. You can continue using Tracker until the access end date above.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              {a.status === "active" || a.reason === "paid_until_period_end"
                ? "Your current subscription cannot be replaced before its paid period ends. Contact support if you need help with a plan change."
                : "Review the plan and billing interval before continuing to the secure checkout."}
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canCancel && (
                <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                  Cancel subscription
                </Button>
              )}
              {!cancelled && (
                <Button
                  disabled={!CHECKOUT_ENABLED || !canChoose}
                  title={
                    CHECKOUT_ENABLED
                      ? canChoose
                        ? "Review available plans"
                        : "Only the workspace owner can start checkout for a workspace without an active subscription"
                      : "Enable the test checkout environment before starting payment"
                  }
                  onClick={() => {
                    window.open("/plans", "_blank", "noopener,noreferrer");
                  }}
                >
                  {CHECKOUT_ENABLED ? (canChoose ? "Choose a plan" : "Plan change unavailable") : "Checkout configuration required"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FreeAccessPanel() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listFreeAccess);
  const update = useServerFn(setFreeAccess);
  const { data, isLoading } = useQuery({
    queryKey: ["free_access"],
    queryFn: () => fetchList({}) as unknown as Promise<FreeAccessRow[]>,
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async (target: string, free: boolean) => {
    setBusy(true);
    try {
      const res = await update({ data: { email: target.trim(), free } });
      toast.success(`${free ? "Free access given" : "Free access removed"}: ${res.updated.join(", ")}`);
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["free_access"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="label-text">
        Give someone free access (international customers, friends, reviewers). Enter the email they signed up with.
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1 sm:min-w-[240px]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="their@email.com"
        />
        <Button size="sm" onClick={() => void apply(email, true)} disabled={busy || !email.includes("@")}>
          Give free access
        </Button>
      </div>
      {isLoading ? (
        <div className="label-text">Loading…</div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {(data ?? []).map((w) => (
            <div key={w.workspaceId} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
              <span className="min-w-0 truncate">
                {w.name} <span className="label-text">{w.ownerEmail}</span>
              </span>
              {w.protected ? (
                <span className="label-text">Yours</span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !w.ownerEmail}
                  onClick={() => void apply(w.ownerEmail ?? "", false)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FreeAccessSettings({ wrap }: { wrap: (n: ReactNode) => ReactNode }) {
  const { data } = useAccess();
  return data?.isSuperAdmin ? <>{wrap(<FreeAccessPanel />)}</> : null;
}
