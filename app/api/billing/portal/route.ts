import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/site";

export async function POST(request: Request) {
  const fd = await request.formData();
  const orgId = String(fd.get("org_id") ?? "");
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("slug, stripe_customer_id").eq("id", orgId).single();
  const { data: isAdmin } = await supabase.rpc("is_admin", { p_org: orgId });
  if (!org || !isAdmin) return NextResponse.redirect(new URL("/orgs", siteUrl()), 303);
  if (!org.stripe_customer_id) {
    return NextResponse.redirect(new URL(`/o/${org.slug}/admin?error=${encodeURIComponent("No billing account yet. Choose a plan first.")}`, siteUrl()), 303);
  }
  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${siteUrl()}/o/${org.slug}/admin`,
    });
    return NextResponse.redirect(portal.url, 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't open billing.";
    return NextResponse.redirect(new URL(`/o/${org.slug}/admin?error=${encodeURIComponent(msg)}`, siteUrl()), 303);
  }
}
