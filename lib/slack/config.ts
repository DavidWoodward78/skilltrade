import { cleanEnv } from "@/lib/plans";
import { siteUrl } from "@/lib/site";

/**
 * Bot scopes for Phase 1, and why:
 * - chat:write        post the interest card and intro, and update the card after a click
 * - im:write          open a 1:1 DM with a member (conversations.open)
 * - mpim:write        open the group DM with both matched members (conversations.open with 2 users)
 * - users:read        required alongside users:read.email
 * - users:read.email  users.lookupByEmail, to find members who joined without Slack sign-in
 * Sign in with Slack uses the separate OpenID scopes openid, email, profile (requested by Supabase).
 */
export const BOT_SCOPES = ["chat:write", "im:write", "mpim:write", "users:read", "users:read.email"] as const;

export function slackEnv() {
  return {
    clientId: cleanEnv(process.env.SLACK_CLIENT_ID),
    clientSecret: cleanEnv(process.env.SLACK_CLIENT_SECRET),
    signingSecret: cleanEnv(process.env.SLACK_SIGNING_SECRET),
    encryptionKey: cleanEnv(process.env.SLACK_TOKEN_ENCRYPTION_KEY),
    cronSecret: cleanEnv(process.env.CRON_SECRET),
  };
}

/** True when everything the bot needs is set. The admin page hides "Add to Slack" otherwise. */
export function slackConfigured(): boolean {
  const e = slackEnv();
  return !!(e.clientId && e.clientSecret && e.signingSecret && e.encryptionKey && cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export function installRedirectUri(): string {
  return `${siteUrl()}/api/slack/oauth/callback`;
}
