import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSubscribe } from "@/lib/live/use-subscribe";
import { supportMailto } from "@/lib/live/support";
import type { PlanKey } from "@/components/account/plans";

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

const PRICING = {
  pro: { monthly: 549, referenceMonthly: 799, yearly: 5299, annualSavings: 1289, annualPercent: "20%" },
  max: { monthly: 899, referenceMonthly: 1099, yearly: 8099, annualSavings: 2689, annualPercent: "25%" },
};

// Mirrors VITE_BILLING_CHECKOUT_ENABLED on the live build.
const CHECKOUT_ENABLED = import.meta.env.VITE_BILLING_CHECKOUT_ENABLED === "true";

export type PlanKind = "trial" | "paid" | "comped" | "expired";

export function PlanPicker({
  trialEndsAt,
  trialEnded = false,
  isOwner = true,
  currentPlanTitle,
  currentPlanDescription,
  currentPlanKind = "trial",
  currentPlanKey = null,
  workspaceName = "your Tracker workspace",
}: {
  trialEndsAt?: string | null;
  trialEnded?: boolean;
  isOwner?: boolean;
  currentPlanTitle?: string;
  currentPlanDescription?: string;
  currentPlanKind?: PlanKind;
  currentPlanKey?: PlanKey | null;
  workspaceName?: string;
}) {
  const [period, setPeriod] = useState<"monthly" | "yearly">(() =>
    currentPlanKey?.endsWith("_annual") ? "yearly" : "monthly",
  );
  const isPaid = currentPlanKind === "paid";
  const onPro = isPaid && (currentPlanKey === "pro_monthly" || currentPlanKey === "pro_annual");
  const onMax = isPaid && (currentPlanKey === "max_monthly" || currentPlanKey === "max_annual");
  const proMonthly = useSubscribe(workspaceName, "pro_monthly");
  const proAnnual = useSubscribe(workspaceName, "pro_annual");
  const maxMonthly = useSubscribe(workspaceName, "max_monthly");
  const maxAnnual = useSubscribe(workspaceName, "max_annual");
  const trialEndLabel = formatDate(trialEndsAt);
  const price = (monthly: number, yearly: number) =>
    period === "monthly" ? monthly.toLocaleString("en-IN") : yearly.toLocaleString("en-IN");
  const pro = period === "monthly" ? proMonthly : proAnnual;
  const max = period === "monthly" ? maxMonthly : maxAnnual;

  const savings = (amount: number, percent: string) => (
    <div className="mt-3 inline-flex w-fit flex-col rounded-lg border border-green-900/70 bg-green-950/50 px-3 py-2">
      <span className="text-xs font-semibold text-green-400">Save ₹{amount.toLocaleString("en-IN")} per year</span>
      <span className="mt-0.5 text-[11px] text-green-400">{percent} less than paying monthly</span>
    </div>
  );

  const periodBtn = (value: "monthly" | "yearly") =>
    `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
      period === value ? "bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.12)]" : "text-zinc-400 hover:text-white"
    }`;

  return (
    <section className="w-full text-white">
      <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-white">
            {isPaid ? "Your Tracker plan" : "Choose your Tracker plan"}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            {isPaid
              ? "Your subscription, expiry date, and included features."
              : "Everything you need to organize leads, run your CRM, and grow your outreach. Choose monthly or yearly billing."}
          </p>
        </div>
        {!isPaid && (
          <div
            className="inline-flex w-fit shrink-0 rounded-full border border-zinc-800 bg-[#101010] p-1"
            role="group"
            aria-label="Billing period"
          >
            <button
              type="button"
              aria-pressed={period === "monthly"}
              onClick={() => setPeriod("monthly")}
              className={periodBtn("monthly")}
            >
              Pay monthly
            </button>
            <button
              type="button"
              aria-pressed={period === "yearly"}
              onClick={() => setPeriod("yearly")}
              className={periodBtn("yearly")}
            >
              Pay yearly
            </button>
          </div>
        )}
      </div>

      <div className={`mt-5 grid items-stretch gap-4 ${isPaid ? "md:grid-cols-1" : "md:grid-cols-3"}`}>
        <article className="flex flex-col rounded-xl border border-white/65 bg-transparent p-5 shadow-[0_0_22px_rgba(255,255,255,0.06)]">
          <div className="mb-3 inline-flex w-fit items-center rounded-full border border-white/25 bg-white px-3 py-1 text-[11px] font-semibold text-black">
            {trialEnded ? "Trial ended" : "Your current plan"}
          </div>
          <h4 className="text-base font-semibold text-white">{currentPlanTitle ?? "7-day free trial"}</h4>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">
            {currentPlanDescription ??
              (trialEnded
                ? "Your trial has ended. Choose a paid plan to continue using Tracker."
                : "You are using Tracker with full core workspace access during your 7-day trial.")}
          </p>
          <div className="mt-4 flex items-baseline gap-1">
            {currentPlanKind === "paid" ? (
              <span className="text-xl font-semibold tracking-tight text-white">Existing plan</span>
            ) : currentPlanKind === "comped" ? (
              <span className="text-xl font-semibold tracking-tight text-white">Special access</span>
            ) : (
              <>
                <span className="text-3xl font-semibold tracking-tight text-white">₹0</span>
                <span className="text-sm text-zinc-500">for 7 days</span>
              </>
            )}
          </div>
          {currentPlanKind === "trial" && !trialEnded && trialEndLabel && (
            <p className="mt-1 text-xs text-zinc-400">Trial ends {trialEndLabel}</p>
          )}
          <div className="my-4 border-t border-zinc-800/80" />
          <p className="text-sm font-medium text-white">
            {currentPlanKind === "paid"
              ? "Your current subscription"
              : currentPlanKind === "comped"
                ? "Your included access"
                : "Included during your trial"}
          </p>
          <ul className="mt-3 flex-1 space-y-2.5 text-[13px] leading-snug text-zinc-300">
            <li>✓ Lead Tracker and core CRM workspace</li>
            <li>✓ One workspace</li>
            <li>✓ Lead and contact records</li>
            <li>✓ Pipeline stages, tags, and countries</li>
            <li>✓ Outreach channels, sender accounts, and targets</li>
            <li>✓ Follow-ups, activity, to-dos, and CRM records</li>
            <li>✓ Available invoice, revenue, template, and productivity tools</li>
            {currentPlanKind === "paid" || currentPlanKind === "comped" ? (
              <li>✓ Access according to your current plan</li>
            ) : (
              <li>✓ 3 AI imports during the entire 7-day trial</li>
            )}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            {currentPlanKind === "paid"
              ? currentPlanKey === "max_annual"
                ? "You are already maxed out."
                : currentPlanKey === "max_monthly"
                  ? "You are already on the Max plan. If you would like to switch to the yearly plan, please wait till the month end."
                  : "You are on the Pro plan. If you would like to upgrade, please contact us."
              : currentPlanKind === "comped"
                ? "Your workspace has special access granted by Tracker."
                : "This is a temporary trial, not a permanent free plan. A paid subscription is required after 7 days. Trial limits must be enforced by the application."}
          </p>
          {currentPlanKind === "paid" ? (
            currentPlanKey === "max_annual" ? null : (
              <a
                href={supportMailto(
                  currentPlanKey === "max_monthly" ? "Tracker yearly plan request" : "Tracker plan upgrade",
                )}
                className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-zinc-700 bg-[#101010] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Contact us
              </a>
            )
          ) : (
            <Button className="mt-5 w-full border-white/20 text-white" variant="outline" disabled>
              {currentPlanKind === "comped" ? "Special access" : trialEnded ? "Trial ended" : "Current trial"}
            </Button>
          )}
        </article>

        {!isPaid && !onPro && !onMax && (
          <article className="flex flex-col rounded-xl border border-zinc-800/90 bg-transparent p-5 transition-colors hover:border-zinc-600">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-white">Pro</h4>
              <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-medium text-zinc-300">
                For freelancers
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-semibold tracking-tight text-white">
                ₹{price(PRICING.pro.monthly, PRICING.pro.yearly)}
              </span>
              <span className="text-sm text-zinc-500">{period === "monthly" ? "/ month" : "/ year"}</span>
              {period === "monthly" && (
                <span className="text-sm text-zinc-500 line-through">
                  ₹{PRICING.pro.referenceMonthly.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {period === "monthly" ? "Billed monthly · introductory price" : "Billed annually · effective ₹441.58/month"}
            </p>
            {period === "yearly" && savings(PRICING.pro.annualSavings, PRICING.pro.annualPercent)}
            <div className="my-5 border-t border-zinc-800" />
            <p className="text-sm font-medium text-white">Everything you need to manage leads</p>
            <ul className="mt-3 flex-1 space-y-3 text-[13px] leading-relaxed text-zinc-300">
              <li>✓ Ongoing paid access after the trial</li>
              <li>✓ Unlimited leads while subscribed</li>
              <li>✓ 1 workspace</li>
              <li>✓ Up to 4 members total (you + 3 teammates)</li>
              <li>✓ 20 AI imports every month</li>
              <li>✓ Lead, contact, pipeline, and tag management</li>
              <li>✓ Outreach channels, targets, follow-ups, and activity tracking</li>
              <li>✓ CRM records, imports/exports, and available productivity tools</li>
            </ul>
            <Button
              className="mt-6 w-full bg-white text-black hover:bg-zinc-200"
              disabled={!isOwner || !CHECKOUT_ENABLED || pro.busy}
              onClick={() => void pro.subscribe()}
              title={
                CHECKOUT_ENABLED
                  ? "Subscribe to Tracker Pro"
                  : "Checkout is disabled until the test billing environment is configured"
              }
            >
              {pro.busy ? "Opening checkout…" : "Upgrade to Pro"}
            </Button>
          </article>
        )}

        {!isPaid && !onMax && (
          <article className="flex flex-col rounded-xl border border-zinc-700/90 bg-transparent p-5 transition-colors hover:border-zinc-500">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-white">Max</h4>
              <span className="rounded-full border border-zinc-700 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-300">
                For growing teams
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-semibold tracking-tight text-white">
                ₹{price(PRICING.max.monthly, PRICING.max.yearly)}
              </span>
              <span className="text-sm text-zinc-500">{period === "monthly" ? "/ month" : "/ year"}</span>
              {period === "monthly" && (
                <span className="text-sm text-zinc-500 line-through">
                  ₹{PRICING.max.referenceMonthly.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {period === "monthly" ? "Billed monthly · introductory price" : "Billed annually · effective ₹674.92/month"}
            </p>
            {period === "yearly" && savings(PRICING.max.annualSavings, PRICING.max.annualPercent)}
            <div className="my-5 border-t border-zinc-800" />
            <p className="text-sm font-medium text-white">More capacity for your workflow</p>
            <ul className="mt-3 flex-1 space-y-3 text-[13px] leading-relaxed text-zinc-300">
              <li>✓ Everything included in Pro</li>
              <li>✓ 3 workspaces included</li>
              <li>✓ Up to 7 members total</li>
              <li>✓ Unlimited AI imports</li>
              <li>✓ Option to add paid workspace and team capacity as you grow</li>
              <li>✓ Centralized lead, CRM, pipeline, and outreach workflows</li>
              <li>✓ Available invoice, revenue, and productivity tools</li>
              <li>✓ Future AI features as they are released and included in Max</li>
            </ul>
            <Button
              className="mt-6 w-full border-zinc-600 text-white hover:bg-white/10"
              variant="outline"
              disabled={!isOwner || !CHECKOUT_ENABLED || max.busy}
              onClick={() => void max.subscribe()}
              title={
                CHECKOUT_ENABLED
                  ? "Subscribe to Tracker Max"
                  : "Checkout is disabled until the test billing environment is configured"
              }
            >
              {max.busy ? "Opening checkout…" : "Upgrade to Max"}
            </Button>
          </article>
        )}
      </div>

      {!isOwner && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-[#0B0B0B] p-3 text-sm text-zinc-400">
          Only the workspace owner can choose a plan.
        </div>
      )}
      {!isPaid && (
        <p className="mt-4 text-center text-xs text-zinc-500">
          Prices are shown in INR.{" "}
          {CHECKOUT_ENABLED
            ? "Checkout uses Razorpay. Plan access updates after server-side payment verification."
            : "Checkout remains disabled until the test billing environment is configured and verified."}
        </p>
      )}
    </section>
  );
}
