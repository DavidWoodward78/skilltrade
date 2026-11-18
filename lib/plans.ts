export type PlanId = "community" | "growth" | "enterprise";

export const PLANS: Record<PlanId, { name: string; price: string; members: number; blurb: string }> = {
  community: { name: "Community", price: "$99/mo", members: 50, blurb: "Small founder groups" },
  growth: { name: "Growth", price: "$249/mo", members: 200, blurb: "Bootcamps and incubators" },
  enterprise: { name: "Enterprise", price: "$499/mo", members: 100000, blurb: "Large accelerators and institutions" },
};

/** Env values pasted into a dashboard often carry stray spaces, line breaks or quotes. */
export function cleanEnv(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/^["']|["']$/g, "").trim();
  return t || undefined;
}

/** Stripe price IDs come from environment variables, so test and live keys can differ. */
export function priceIdFor(plan: PlanId): string | undefined {
  return {
    community: cleanEnv(process.env.STRIPE_PRICE_COMMUNITY),
    growth: cleanEnv(process.env.STRIPE_PRICE_GROWTH),
    enterprise: cleanEnv(process.env.STRIPE_PRICE_ENTERPRISE),
  }[plan];
}

export function planForPriceId(priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null;
  for (const p of Object.keys(PLANS) as PlanId[]) if (priceIdFor(p) === priceId) return p;
  return null;
}

export function billingConfigured() {
  return !!cleanEnv(process.env.STRIPE_SECRET_KEY) && !!priceIdFor("community");
}

export const PLAN_LABEL: Record<string, string> = {
  trial: "Free trial",
  pilot: "Pilot (free)",
  community: "Community",
  growth: "Growth",
  enterprise: "Enterprise",
};
