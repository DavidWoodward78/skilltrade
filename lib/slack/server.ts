import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";
import { callSlack } from "./api.ts";
import { planIncludesSlack, slackConfigured, slackEnv } from "./config.ts";
import { decryptToken } from "./crypto.ts";
import { drainOutbox, type Card, type Deps, type MatchInfo, type OutboxItem, type RespondResult, type SlackDb, type Workspace } from "./flows.ts";
import type { InterestContext, SkillItem } from "./blocks.ts";

/**
 * Server only (uses the service-role key). Never import from client components.
 *
 * Server-side Slack data access. Uses the service-role client (bypasses RLS), so every
 * query below filters by org_id explicitly, and the security-sensitive steps go through
 * database functions that re-check the community (slack_respond_card, slack_interest_context).
 */
function makeDb(): SlackDb {
  const db = createAdminClient();
  const key = slackEnv().encryptionKey;

  async function workspace(col: "org_id" | "team_id", value: string): Promise<Workspace | null> {
    const { data } = await db
      .from("slack_workspaces")
      .select("org_id, team_id, bot_token_enc, organizations(plan)")
      .eq(col, value)
      .is("disabled_at", null)
      .maybeSingle();
    if (!data) return null;
    // Downgraded to a plan without Slack: paused (still linked, nothing sent).
    const org = data.organizations as unknown as { plan: string } | { plan: string }[] | null;
    const plan = Array.isArray(org) ? org[0]?.plan : org?.plan;
    if (!plan || !planIncludesSlack(plan)) return null;
    return { orgId: data.org_id, teamId: data.team_id, token: decryptToken(data.bot_token_enc, key) };
  }

  async function skills(userIds: string[]) {
    const { data } = await db.from("user_skills").select("user_id, kind, category, skill").in("user_id", userIds).order("category");
    return data ?? [];
  }

  return {
    workspaceForOrg: (orgId) => workspace("org_id", orgId),
    workspaceForTeam: (teamId) => workspace("team_id", teamId),

    async interestContext(orgId, from, to) {
      const { data, error } = await db.rpc("slack_interest_context", { p_org: orgId, p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      return (data as InterestContext | null) ?? null;
    },

    async upsertCard(orgId, from, to) {
      await db.from("slack_cards").upsert({ org_id: orgId, from_user: from, to_user: to }, { onConflict: "org_id,from_user,to_user", ignoreDuplicates: true });
      const { data, error } = await db
        .from("slack_cards")
        .select("id, state, channel_id, message_ts")
        .eq("org_id", orgId).eq("from_user", from).eq("to_user", to)
        .single();
      if (error || !data) throw new Error(error?.message ?? "card not found");
      return data as Card;
    },

    async setCardMessage(orgId, cardId, channelId, ts) {
      await db.from("slack_cards").update({ channel_id: channelId, message_ts: ts }).eq("id", cardId).eq("org_id", orgId);
    },

    async openCardsBetween(orgId, a, b) {
      const { data } = await db
        .from("slack_cards")
        .select("id, state, channel_id, message_ts")
        .eq("org_id", orgId)
        .eq("state", "pending")
        .or(`and(from_user.eq.${a},to_user.eq.${b}),and(from_user.eq.${b},to_user.eq.${a})`);
      return (data ?? []) as Card[];
    },

    async setCardState(orgId, cardId, state) {
      await db.from("slack_cards").update({ state, decided_at: new Date().toISOString() }).eq("id", cardId).eq("org_id", orgId);
    },

    async respondCard(cardId, teamId, slackUserId, interested) {
      const { data, error } = await db.rpc("slack_respond_card", {
        p_card: cardId, p_team: teamId, p_slack_user: slackUserId, p_interested: interested,
      });
      if (error) throw new Error(error.message);
      return data as RespondResult;
    },

    async memberSlackId(orgId, userId) {
      const { data } = await db.from("memberships").select("slack_user_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      return { isMember: !!data, slackUserId: data?.slack_user_id ?? null };
    },

    async setMemberSlackId(orgId, userId, slackUserId) {
      const { error } = await db
        .from("memberships")
        .update({ slack_user_id: slackUserId })
        .eq("org_id", orgId).eq("user_id", userId).is("slack_user_id", null);
      return !error; // unique violation: another member already holds this Slack user
    },

    async lookupUser(userId) {
      const { data } = await db.auth.admin.getUserById(userId);
      const u = data?.user;
      const ident = u?.identities?.find((i) => i.provider === "slack_oidc");
      const claims = (ident?.identity_data?.custom_claims ?? {}) as Record<string, string>;
      return {
        // Only a confirmed address is used to find someone in Slack.
        email: u?.email && u.email_confirmed_at ? u.email : null,
        slackTeamId: claims["https://slack.com/team_id"] ?? null,
        // Supabase keeps the Slack user id as the identity's subject (provider_id).
        slackUserId: claims["https://slack.com/user_id"] ?? (ident?.identity_data?.sub as string | undefined) ?? ident?.id ?? null,
      };
    },

    async matchInfo(orgId, matchId) {
      const { data: m } = await db.from("matches").select("id, user_a, user_b").eq("id", matchId).eq("org_id", orgId).maybeSingle();
      if (!m) return null;
      const ids = [m.user_a, m.user_b];
      const [{ data: org }, { data: profiles }, sk] = await Promise.all([
        db.from("organizations").select("id, name, slug").eq("id", orgId).single(),
        db.from("profiles").select("id, display_name").in("id", ids),
        skills(ids),
      ]);
      if (!org) return null;
      const pick = (id: string, kind: string): SkillItem[] =>
        sk.filter((s) => s.user_id === id && s.kind === kind).map((s) => ({ category: s.category, skill: s.skill }));
      return {
        org,
        people: ids.map((id) => ({
          id,
          display_name: profiles?.find((p) => p.id === id)?.display_name ?? "",
          offers: pick(id, "offer"),
          needs: pick(id, "need"),
        })),
      } satisfies MatchInfo;
    },

    async disableTeam(teamId, reason) {
      await db.rpc("slack_disable_team", { p_team: teamId, p_reason: reason });
    },

    async firstTime(key) {
      const { error } = await db.from("slack_events_seen").insert({ key });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(error.message);
    },

    async claimOutbox(limit) {
      const { data, error } = await db.rpc("slack_claim_outbox", { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as OutboxItem[];
    },

    async finishOutbox(id, status, result, error) {
      await db.from("slack_outbox").update({
        status, result: result ?? null, last_error: error ?? null, finished_at: new Date().toISOString(), locked_until: null,
      }).eq("id", id);
    },

    async retryOutbox(id, at, error) {
      await db.from("slack_outbox").update({ next_attempt_at: at.toISOString(), last_error: error, locked_until: null }).eq("id", id);
    },
  };
}

export function slackDeps(): Deps {
  return { db: makeDb(), slack: (token, method, body) => callSlack(method, token, body), siteUrl: siteUrl() };
}

/** Send whatever Slack notifications are due. Safe to call anywhere; never throws. */
export async function kickSlackOutbox(limit = 20): Promise<number> {
  if (!slackConfigured()) return 0;
  try {
    return await drainOutbox(slackDeps(), limit);
  } catch (e) {
    console.error("[slack] outbox", e);
    return 0;
  }
}
