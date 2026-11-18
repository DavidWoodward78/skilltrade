import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export type Org = {
  id: string;
  name: string;
  slug: string;
  invite_code: string;
  plan: string;
  billing_status: string;
  trial_ends_at: string;
  member_limit: number;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  require_approval: boolean;
  allowed_email_domain: string | null;
};

/** Loads the org by slug for the signed-in member. RLS hides orgs you don't belong to. */
export const getOrgContext = cache(async (slug: string) => {
  const { supabase, user } = await requireUser();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, invite_code, plan, billing_status, trial_ends_at, member_limit, current_period_end, stripe_customer_id, require_approval, allowed_email_domain")
    .eq("slug", slug)
    .maybeSingle<Org>();
  if (!org) notFound();
  const { data: m } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();
  const { data: active } = await supabase.rpc("org_is_active", { p_org: org.id });
  return { supabase, user, org, isAdmin: m?.role === "admin", active: active !== false };
});

export function back(path: string, msg: { error?: string; notice?: string }): string {
  const q = msg.error ? `error=${encodeURIComponent(msg.error)}` : `notice=${encodeURIComponent(msg.notice ?? "")}`;
  return `${path}${path.includes("?") ? "&" : "?"}${q}`;
}
