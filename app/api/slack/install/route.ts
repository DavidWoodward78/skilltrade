import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOT_SCOPES, installRedirectUri, slackConfigured, slackEnv } from "@/lib/slack/config";

export const runtime = "nodejs";

const STATE_COOKIE = "st_slack_install";

/** "Add to Slack" from a community's admin page. Admins only. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org") ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  const { data: org } = await supabase.from("organizations").select("id, slug").eq("id", orgId).maybeSingle();
  const { data: isAdmin } = org ? await supabase.rpc("is_admin", { p_org: org.id }) : { data: false };
  if (!org || !isAdmin) return NextResponse.redirect(new URL("/orgs", url.origin));
  if (!slackConfigured()) {
    return NextResponse.redirect(new URL(`/o/${org.slug}/admin?error=${encodeURIComponent("Slack isn't set up on this server yet.")}`, url.origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorize = new URL("https://slack.com/oauth/v2/authorize");
  authorize.searchParams.set("client_id", slackEnv().clientId!);
  authorize.searchParams.set("scope", BOT_SCOPES.join(","));
  authorize.searchParams.set("redirect_uri", installRedirectUri());
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize);
  res.cookies.set(STATE_COOKIE, `${state}.${org.id}`, {
    httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/slack", maxAge: 600,
  });
  return res;
}
