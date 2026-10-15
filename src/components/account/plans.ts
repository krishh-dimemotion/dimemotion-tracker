export const PLAN_KEYS = ["pro_monthly", "pro_annual", "max_monthly", "max_annual"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}
