import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/live/kit";
import type { PlanKey } from "@/components/account/plans";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Plans and pricing | Tracker" },
      { name: "description", content: "Compare Tracker plans and choose monthly or annual billing." },
    ],
  }),
  component: PlansPage,
});

type Plan = {
  key: PlanKey;
  name: string;
  price: string;
  interval: "month" | "year";
  description: string;
  features: string[];
  saving?: string;
};

const PRO_FEATURES = [
  "1 workspace",
  "Up to 4 members total",
  "20 AI imports each billing month",
  "Lead, contact, pipeline and tag management",
  "Outreach, follow-ups and activity tracking",
];
const MAX_FEATURES = [
  "Everything included in Pro",
  "Up to 3 workspaces",
  "Up to 7 members total",
  "Unlimited AI imports",
  "Invoice, revenue and productivity tools",
];

const PLANS: Plan[] = [
  {
    key: "pro_monthly",
    name: "Tracker Pro",
    price: "₹549",
    interval: "month",
    description: "For freelancers and small teams",
    features: PRO_FEATURES,
  },
  {
    key: "pro_annual",
    name: "Tracker Pro",
    price: "₹5,299",
    interval: "year",
    description: "For freelancers and small teams",
    features: PRO_FEATURES,
    saving: "Save 20% · ₹1,289 vs monthly",
  },
  {
    key: "max_monthly",
    name: "Tracker Max",
    price: "₹899",
    interval: "month",
    description: "For growing teams",
    features: MAX_FEATURES,
  },
  {
    key: "max_annual",
    name: "Tracker Max",
    price: "₹8,099",
    interval: "year",
    description: "For growing teams",
    features: MAX_FEATURES,
    saving: "Save 25% · ₹2,689 vs monthly",
  },
];

function PlansPage() {
  const navigate = useNavigate();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const visible = PLANS.filter((p) => p.interval === interval);

  const toggle = (value: "month" | "year") =>
    `rounded-full px-5 py-2 text-sm font-medium transition ${
      interval === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-6xl">
        <button
          type="button"
          onClick={() => void navigate({ to: "/settings" })}
          className="mb-6 text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to Tracker
        </button>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Tracker plans</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose the plan that fits your work.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Compare features and billing intervals before moving to secure checkout.
          </p>
          <div
            className="mt-6 inline-flex rounded-full border border-border bg-card p-1"
            role="group"
            aria-label="Billing interval"
          >
            <button
              type="button"
              aria-pressed={interval === "month"}
              onClick={() => setInterval("month")}
              className={toggle("month")}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={interval === "year"}
              onClick={() => setInterval("year")}
              className={toggle("year")}
            >
              Yearly
            </button>
          </div>
        </div>
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          {visible.map((plan) => (
            <Card
              key={plan.key}
              className={`flex h-full flex-col p-6 sm:p-7 ${
                plan.name === "Tracker Max" ? "border-primary/50 shadow-lg" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                </div>
                {plan.name === "Tracker Max" && (
                  <span className="rounded-full border border-primary/30 px-3 py-1 text-xs font-medium">
                    For growing teams
                  </span>
                )}
              </div>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/ {plan.interval}</span>
              </div>
              {plan.saving && <p className="mt-2 text-sm font-medium text-emerald-600">{plan.saving}</p>}
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-emerald-600" aria-hidden="true">
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-7 w-full"
                onClick={() => void navigate({ to: "/checkout", search: { plan: plan.key } })}
              >
                Continue with {plan.name.replace("Tracker ", "")}{" "}
                <span className="ml-1" aria-hidden="true">
                  →
                </span>
              </Button>
            </Card>
          ))}
        </div>
        <p className="mx-auto mt-7 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          You'll review your selected plan and billing interval before continuing to secure checkout.
        </p>
      </div>
    </main>
  );
}
