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
// Billing (Razorpay) is not configured on this deployment. getBillingAccess
// grants full access to everyone so nothing is gated; checkout handlers fail
// with a clear message.
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
  .handler(async ({ context }): Promise<BillingAccess> => {
    // Billing is not enforced on this deployment: every member gets full access.
    let isOwner = false;
    try {
      const { ctxOf, currentWorkspace } = await import("./server-ctx");
      const { sb, userId } = ctxOf(context);
      isOwner = (await currentWorkspace(sb, userId)).role === "owner";
    } catch {
      isOwner = false;
    }
    return {
      allowed: true,
      reason: "paid",
      status: "active",
      plan_key: "max_annual",
      isOwner,
      trial_ends_at: null,
      current_period_end: null,
      ai_import_quota: { remaining: null, limit: null, unlimited: true },
    };
  });

const createSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planKey: PlanKey }) => d)
  .handler(async (): Promise<{ subscriptionId: string; keyId: string; email?: string }> => {
    throw new Error("Payments are not configured on this server. Your workspace already has full access.");
  });

const verifySubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async (): Promise<{ ok: true }> => {
    throw new Error("Payments are not configured on this server.");
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: true }> => {
    throw new Error("There is no paid subscription to cancel. Billing is not configured on this server.");
  });

export const checkPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subscriptionId: string }) => d)
  .handler(async (): Promise<{ status: string }> => {
    throw new Error("Payments are not configured on this server.");
  });

export const listFreeAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ email: string }[]> => []);

export const setFreeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; free: boolean }) => d)
  .handler(async (): Promise<{ updated: string[] }> => {
    throw new Error("Everyone already has free access on this server.");
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
