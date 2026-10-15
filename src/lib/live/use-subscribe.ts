// Live chunk: useSubscribe-B5OtvQSj.js
// Export mapping:
//   t -> BILLING_ACCESS_KEY        query key ["billing_access"]
//   a -> getBillingAccess          (GET)  -> BillingAccess
//   r -> cancelSubscription        (POST)
//   i -> checkPaymentStatus        (POST) { subscriptionId } -> { status }
//   o -> listFreeAccess            (GET)
//   s -> setFreeAccess             (POST) { email, free } -> { updated: string[] }
//   n -> useSubscribe              Razorpay subscription checkout hook
// Not exported by the chunk but used by useSubscribe: createSubscription,
// verifySubscriptionPayment.
//
// TODO(server): all billing handlers are server-only (Razorpay keys, the
// billing tables). getBillingAccess is stubbed to an open trial so the shell
// renders the trial banner; replace it with the real entitlement query.
import { useState } from "react";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IS_TEST_MODE } from "./test-mode";

export type PlanKey = "pro_monthly" | "pro_annual" | "max_monthly" | "max_annual";

export type BillingAccess = {
  allowed: boolean;
  reason:
    | "trial"
    | "paid"
    | "paid_until_period_end"
    | "comped"
    | "expired"
    | "not_member"
    | string;
  status?: string | null;
  plan_key?: string | null;
  isOwner?: boolean;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  billing_source_workspace_id?: string | null;
  ai_import_quota?: {
    remaining?: number | null;
    limit?: number | null;
    unlimited?: boolean;
    period_end?: string | null;
  } | null;
};

export const BILLING_ACCESS_KEY = ["billing_access"] as const;

export const getBillingAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<BillingAccess> => {
    // TODO(server): real entitlement lookup per workspace.
    return {
      allowed: true,
      reason: "trial",
      isOwner: true,
      trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      ai_import_quota: { remaining: 3, limit: 3 },
    };
  });

const createSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planKey: PlanKey }) => d)
  .handler(async (): Promise<{ subscriptionId: string; keyId: string; email?: string }> => {
    throw new Error("Checkout is not set up on this server yet.");
  });

const verifySubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async (): Promise<{ ok: true }> => {
    throw new Error("Payment verification is not set up on this server yet.");
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true }> => {
    throw new Error("Cancelling is not set up on this server yet.");
  });

export const checkPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subscriptionId: string }) => d)
  .handler(async (): Promise<{ status: string }> => {
    throw new Error("Payment status is not set up on this server yet.");
  });

export const listFreeAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ email: string }[]> => []);

export const setFreeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; free: boolean }) => d)
  .handler(async (): Promise<{ updated: string[] }> => {
    throw new Error("Free access is not set up on this server yet.");
  });

const PLAN_LABELS: Record<PlanKey, string> = {
  pro_monthly: "Tracker Pro - ₹549/month",
  pro_annual: "Tracker Pro - ₹5,299/year",
  max_monthly: "Tracker Max - ₹899/month",
  max_annual: "Tracker Max - ₹8,099/year",
};

type RazorpayResponse = Record<string, unknown>;
type RazorpayInstance = {
  on: (event: string, cb: (e: { error?: { description?: string } }) => void) => void;
  open: () => void;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpay() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(Error("Couldn't load Razorpay. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

async function openRazorpay(opts: {
  keyId: string;
  subscriptionId: string;
  email?: string;
  workspaceName: string;
  planKey: PlanKey;
}) {
  await loadRazorpay();
  return new Promise<RazorpayResponse | null>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: opts.keyId,
      subscription_id: opts.subscriptionId,
      name: "Tracker",
      description: PLAN_LABELS[opts.planKey] + " for " + opts.workspaceName,
      prefill: opts.email ? { email: opts.email } : undefined,
      theme: { color: "#111111" },
      handler: (r: RazorpayResponse) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on("payment.failed", (e) =>
      reject(Error(e.error?.description ?? "The payment didn't go through. Please try again.")),
    );
    rzp.open();
  });
}

export function useSubscribe(
  workspaceName: string,
  planKey: PlanKey,
  onPaid?: () => void,
  onCreated?: (subscriptionId: string) => void,
  onDismissed?: (subscriptionId: string) => void,
  onFailed?: (subscriptionId: string) => void,
) {
  const create = useServerFn(createSubscription);
  const verify = useServerFn(verifySubscriptionPayment);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return {
    subscribe: async () => {
      if (IS_TEST_MODE && import.meta.env["VITE_BILLING_CHECKOUT_ENABLED"] !== "true") return;
      setBusy(true);
      let subId: string | undefined;
      try {
        const { subscriptionId, keyId, email } = await create({ data: { planKey } });
        subId = subscriptionId;
        onCreated?.(subscriptionId);
        const res = await openRazorpay({ keyId, subscriptionId, email, workspaceName, planKey });
        if (!res) {
          onDismissed?.(subscriptionId);
          return;
        }
        await verify({ data: res });
        toast.success("Payment received. Welcome to Tracker!");
        await qc.invalidateQueries({ queryKey: BILLING_ACCESS_KEY });
        onPaid?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Payment failed. Please try again.");
        if (subId) onFailed?.(subId);
      } finally {
        setBusy(false);
      }
    },
    busy,
  };
}

export { BILLING_ACCESS_KEY as BILLING_ACCESS_QUERY_KEY };
