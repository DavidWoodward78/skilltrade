import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { PLANS, priceIdFor, type PlanId } from "@/lib/plans";
import { siteUrl } from "@/lib/site";

export async function POST(request: Request) {
  const fd = await request.formData();
  const orgId = String(fd.get("org_id") ?? "");
  const plan = String(fd.get("plan") ?? "") as PlanId;
  const supabase = await createClient();
  const back = (slug: string, msg: string) =>
    NextResponse.redirect(new URL(`/o/${slug}/admin?error=${encodeURIComponent(msg)}`, siteUrl()), 303);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug, name, stripe_customer_id")
    .eq("id", orgId)
    .single();
  if (!user || !org) return NextResponse.redirect(new URL("/login", siteUrl()), 303);
  const { data: isAdmin } = await supabase.rpc("is_admin", { p_org: orgId });
  if (!isAdmin) return back(org.slug, "Only admins can manage billing.");
  if (!(plan in PLANS)) return back(org.slug, "Pick a plan.");
  const price = priceIdFor(plan);
  if (!price || !process.env.STRIPE_SECRET_KEY) return back(org.slug, "Billing isn't set up yet. Contact SkillTrade.");

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      ...(org.stripe_customer_id ? { customer: org.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: org.id,
      metadata: { org_id: org.id, plan },
      subscription_data: { metadata: { org_id: org.id, plan } },
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/o/${org.slug}/admin?notice=${encodeURIComponent("Thanks! Your plan is active.")}`,
      cancel_url: `${siteUrl()}/o/${org.slug}/admin`,
    });
    return NextResponse.redirect(session.url!, 303);
  } catch (e) {
    return back(org.slug, e instanceof Error ? e.message : "Couldn't start checkout.");
  }
}
