import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export type Org = { id: string; name: string; slug: string; invite_code: string };

/** Loads the org by slug for the signed-in member. RLS hides orgs you don't belong to. */
export const getOrgContext = cache(async (slug: string) => {
  const { supabase, user } = await requireUser();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, invite_code")
    .eq("slug", slug)
    .maybeSingle<Org>();
  if (!org) notFound();
  const { data: m } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();
  return { supabase, user, org, isAdmin: m?.role === "admin" };
});

export function back(path: string, msg: { error?: string; notice?: string }): string {
  const q = msg.error ? `error=${encodeURIComponent(msg.error)}` : `notice=${encodeURIComponent(msg.notice ?? "")}`;
  return `${path}${path.includes("?") ? "&" : "?"}${q}`;
}
