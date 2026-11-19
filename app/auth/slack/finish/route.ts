import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinResultPath } from "@/lib/join";

/**
 * Sign in with Slack lands here after /auth/callback has created the session.
 * If the person's Slack workspace is linked to a community, join it (or request to join when
 * admin approval is on). The workspace is read from their Slack identity in the database.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") ?? "/orgs";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/orgs";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, url.origin));

  const { data, error } = await supabase.rpc("join_org_via_slack");
  if (error || !data || data.status === "none") return NextResponse.redirect(new URL(next, url.origin));
  // Already a member and heading somewhere specific (e.g. an invite link): keep going there.
  if (data.status === "already" && next !== "/orgs") return NextResponse.redirect(new URL(next, url.origin));
  return NextResponse.redirect(new URL(joinResultPath(data), url.origin));
}
