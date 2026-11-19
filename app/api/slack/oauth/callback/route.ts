import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeOAuthCode } from "@/lib/slack/api";
import { BOT_SCOPES, installRedirectUri, planIncludesSlack, slackEnv } from "@/lib/slack/config";
import { encryptToken } from "@/lib/slack/crypto";

export const runtime = "nodejs";

const STATE_COOKIE = "st_slack_install";

/** Slack sends the admin back here after "Add to Slack". */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const [expectedState, orgId] = (jar.get(STATE_COOKIE)?.value ?? "").split(".");
  jar.delete({ name: STATE_COOKIE, path: "/api/slack" });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));
  const { data: org } = orgId ? await supabase.from("organizations").select("id, slug, plan").eq("id", orgId).maybeSingle() : { data: null };
  if (!org) return NextResponse.redirect(new URL("/orgs", url.origin));
  const back = (key: "error" | "notice", msg: string) =>
    NextResponse.redirect(new URL(`/o/${org.slug}/admin?${key}=${encodeURIComponent(msg)}`, url.origin));

  const { data: isAdmin } = await supabase.rpc("is_admin", { p_org: org.id });
  if (!isAdmin) return NextResponse.redirect(new URL("/orgs", url.origin));
  if (!planIncludesSlack(org.plan)) return back("error", "Slack is included on the Growth and Enterprise plans.");

  const state = url.searchParams.get("state") ?? "";
  const stateOk = !!expectedState && state.length === expectedState.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(expectedState));
  if (!stateOk) return back("error", "That Slack link expired. Try Add to Slack again.");
  if (url.searchParams.get("error")) return back("error", "Slack wasn't connected.");
  const code = url.searchParams.get("code");
  if (!code) return back("error", "Slack wasn't connected.");

  const env = slackEnv();
  try {
    const r = await exchangeOAuthCode({ code, redirectUri: installRedirectUri(), clientId: env.clientId!, clientSecret: env.clientSecret! });
    if (r.is_enterprise_install || !r.team?.id) return back("error", "Enterprise Grid org-wide installs aren't supported yet. Install to a single workspace.");
    if (r.token_type !== "bot" || !r.access_token || !r.bot_user_id) return back("error", "Slack didn't return a bot token.");
    const granted = String(r.scope ?? "").split(",");
    const missing = BOT_SCOPES.filter((s) => !granted.includes(s));
    if (missing.length) return back("error", `Slack didn't grant: ${missing.join(", ")}.`);

    const { data: result, error } = await createAdminClient().rpc("slack_link_workspace", {
      p_org: org.id,
      p_team: r.team.id,
      p_team_name: r.team.name ?? "",
      p_app: r.app_id ?? null,
      p_bot_user: r.bot_user_id,
      p_token_enc: encryptToken(r.access_token, env.encryptionKey),
      p_scopes: r.scope ?? "",
      p_installed_by: user.id,
    });
    if (error) throw new Error(error.message);
    if (result === "linked_elsewhere") return back("error", "That Slack workspace is already connected to another SkillTrade community.");
    return back("notice", `Slack connected to ${r.team.name ?? "your workspace"}. Members get match DMs from now on.`);
  } catch (e) {
    console.error("[slack] install", e);
    return back("error", "Couldn't connect Slack. Try again.");
  }
}
