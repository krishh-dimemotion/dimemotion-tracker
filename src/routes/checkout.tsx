import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Card, Loading } from "@/components/live/kit";
import { checkPaymentStatus, useSubscribe } from "@/lib/live/use-subscribe";
import { supportMailto } from "@/lib/live/support";
import { isPlanKey, type PlanKey } from "@/components/account/plans";

export const Route = createFileRoute("/checkout")({
  validateSearch: (s: Record<string, unknown>): { plan: PlanKey } => ({
    plan: isPlanKey(s.plan) ? s.plan : "pro_monthly",
  }),
  head: () => ({ meta: [{ title: "Secure checkout | Tracker" }] }),
  component: CheckoutPage,
});

type PlanInfo = {
  name: string;
  price: string;
  interval: "month" | "year";
  saving: string;
  description: string;
  features: string[];
};

const PRO_FEATURES = [
  "1 workspace",
  "Up to 4 members total",
  "20 AI imports each billing month",
  "Lead, contact, pipeline and tag management",
  "Outreach, follow-ups and activity tracking",
];
const MAX_FEATURES = [
  "Up to 3 workspaces",
  "Up to 7 members total",
  "Unlimited AI imports",
  "Centralized lead, CRM and outreach workflows",
  "Invoice, revenue and productivity tools",
];

const PLAN_INFO: Record<PlanKey, PlanInfo> = {
  pro_monthly: {
    name: "Tracker Pro",
    price: "₹549",
    interval: "month",
    saving: "",
    description: "For freelancers and small teams",
    features: PRO_FEATURES,
  },
  pro_annual: {
    name: "Tracker Pro",
    price: "₹5,299",
    interval: "year",
    saving: "Save 20% (₹1,289 vs monthly)",
    description: "For freelancers and small teams",
    features: PRO_FEATURES,
  },
  max_monthly: {
    name: "Tracker Max",
    price: "₹899",
    interval: "month",
    saving: "",
    description: "For growing teams",
    features: MAX_FEATURES,
  },
  max_annual: {
    name: "Tracker Max",
    price: "₹8,099",
    interval: "year",
    saving: "Save 25% (₹2,689 vs monthly)",
    description: "For growing teams",
    features: MAX_FEATURES,
  },
};

const TOAST_CLASS = "!border-zinc-200 !bg-white !text-zinc-900 !shadow-xl";
const WEEK_MS = 604_800_000;

function CheckoutPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const planKey: PlanKey = isPlanKey(search?.plan) ? search.plan : "pro_monthly";
  const { loading, session, workspace } = useAuth();
  const plan = PLAN_INFO[planKey];
  const checkStatus = useServerFn(checkPaymentStatus);
  const pendingKey = "tracker_pending_checkout:" + (workspace?.id ?? "unknown");

  const verifyPayment = async (subscriptionId: string) => {
    const id = "tracker-checkout-payment-status";
    toast.loading("Checking your Razorpay payment status…", { id, className: TOAST_CLASS });
    try {
      const res = await checkStatus({ data: { subscriptionId } });
      if (res.status === "paid") {
        window.localStorage.removeItem(pendingKey);
        toast.success("Payment verified. Your Tracker subscription is being updated.", {
          id,
          icon: <CircleCheck className="h-5 w-5 text-emerald-600" />,
          className: TOAST_CLASS,
          duration: 6000,
        });
        window.setTimeout(() => void navigate({ to: "/lt/dashboard" }), 1200);
      } else if (res.status === "not_paid") {
        window.localStorage.removeItem(pendingKey);
        toast.error(
          "It looks like you didn't complete checkout. Razorpay has not confirmed a successful payment. You can try again below. If you just authorized a payment, wait for the status to update before retrying.",
          { id, icon: <CircleAlert className="h-5 w-5 text-red-600" />, className: TOAST_CLASS, duration: 9000 },
        );
      } else {
        toast.error(
          "Your checkout status is still being confirmed. If you believe you paid, contact support before retrying so you aren't charged twice.",
          { id, icon: <Clock3 className="h-5 w-5 text-amber-600" />, className: TOAST_CLASS, duration: 9000 },
        );
      }
    } catch {
      toast.error(
        "We couldn't confirm the payment status just yet. Please contact support before retrying if you believe you paid.",
        { id, icon: <CircleAlert className="h-5 w-5 text-red-600" />, className: TOAST_CLASS, duration: 9000 },
      );
    }
  };

  // Payment provider calls live inside the shared useSubscribe hook (stubbed there).
  const { subscribe, busy } = useSubscribe(
    workspace?.name ?? "your Tracker workspace",
    planKey,
    () => {
      window.localStorage.removeItem(pendingKey);
      void navigate({ to: "/lt/dashboard" });
    },
    (subscriptionId: string) => {
      window.localStorage.setItem(
        pendingKey,
        JSON.stringify({ subscriptionId, planKey, createdAt: Date.now() }),
      );
    },
    (subscriptionId: string) => void verifyPayment(subscriptionId),
    (subscriptionId: string) => void verifyPayment(subscriptionId),
  );

  useEffect(() => {
    if (!workspace || workspace.role !== "owner") return;
    const raw = window.localStorage.getItem(pendingKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { subscriptionId?: string; planKey?: string; createdAt?: number };
      if (!saved.subscriptionId || saved.planKey !== planKey || !saved.createdAt || Date.now() - saved.createdAt > WEEK_MS)
        return;
      void verifyPayment(saved.subscriptionId);
    } catch {
      window.localStorage.removeItem(pendingKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, workspace?.role, planKey]);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", search: { mode: "signin", plan: planKey } });
  }, [loading, session, navigate, planKey]);

  if (loading || !session || !workspace) return <Loading />;

  const isOwner = workspace.role === "owner";

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground">
      <div className="mx-auto w-full max-w-3xl">
        <button
          type="button"
          onClick={() => void navigate({ to: "/settings" })}
          className="mb-6 text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to Tracker
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Secure checkout</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Review your plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirm your selection, then continue to Razorpay to complete your payment.
        </p>
        <div className="mt-7 grid gap-5 md:grid-cols-[1.3fr_0.7fr]">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              </div>
              <span className="rounded-full border border-blue-300 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                Selected plan
              </span>
            </div>
            <div className="my-6 border-t border-border" />
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold">{plan.price}</span>
              <span className="text-sm text-muted-foreground">/ {plan.interval}</span>
            </div>
            {plan.saving && (
              <p className="mt-3 inline-flex rounded-full border border-green-300 bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800">
                {plan.saving}
              </p>
            )}
            <ul className="mt-6 space-y-3 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-green-600">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              Your paid access is activated only after the server verifies the Razorpay response and updates your
              subscription.
            </p>
          </Card>
          <Card className="h-fit p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order summary</p>
            <div className="mt-5 flex justify-between gap-3 text-sm">
              <span>{plan.name}</span>
              <span>{plan.price}</span>
            </div>
            <div className="mt-3 flex justify-between gap-3 text-sm text-muted-foreground">
              <span>Billed</span>
              <span>{plan.interval === "year" ? "annually" : "monthly"}</span>
            </div>
            <div className="my-5 border-t border-border" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Total at checkout</span>
              <strong className="text-2xl">{plan.price}</strong>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Final amount and interval are confirmed in Razorpay before payment.
            </p>
            <Button className="mt-6 w-full" onClick={() => void subscribe()} disabled={busy || !isOwner}>
              {busy ? "Opening secure checkout..." : "Continue to checkout"}
            </Button>
            {!isOwner && (
              <p className="mt-3 text-xs text-muted-foreground">Only the workspace owner can purchase a plan.</p>
            )}
            <a
              href={supportMailto(
                "Tracker checkout help",
                `I need help with the ${plan.name} ${plan.interval} checkout. Workspace: ${workspace?.name ?? "unknown"}.`,
              )}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              Contact support
            </a>
          </Card>
        </div>
      </div>
    </main>
  );
}
