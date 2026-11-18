import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, cleanEnv, planForPriceId } from "@/lib/plans";

const STATUS: Record<string, string> = {
  trialing: "active",
  active: "active",
  past_due: "past_due",
  unpaid: "lapsed",
  canceled: "canceled",
  incomplete: "lapsed",
  incomplete_expired: "lapsed",
  paused: "lapsed",
};

async function applySubscription(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.org_id;
  if (!orgId) return;
  const item = sub.items.data[0];
  const plan = planForPriceId(item?.price?.id) ?? (sub.metadata?.plan as keyof typeof PLANS | undefined) ?? null;
  // current_period_end moved onto subscription items in newer Stripe API versions
  const periodEnd =
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  const update: Record<string, unknown> = {
    billing_status: STATUS[sub.status] ?? "lapsed",
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
  if (plan && plan in PLANS) {
    update.plan = plan;
    update.member_limit = PLANS[plan].members;
  }
  const db = createAdminClient();
  // Never overwrite an owner-granted pilot
  await db.from("organizations").update(update).eq("id", orgId).neq("plan", "pilot");
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = cleanEnv(process.env.STRIPE_WEBHOOK_SECRET);
  if (!signature || !secret) return NextResponse.json({ error: "not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) {
        const sub = await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
        if (!sub.metadata?.org_id && s.metadata?.org_id) sub.metadata = { ...sub.metadata, org_id: s.metadata.org_id };
        await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription);
      break;
  }
  return NextResponse.json({ received: true });
}
