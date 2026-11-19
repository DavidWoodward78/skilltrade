/**
 * PHASE 2 STUB: weekly digest to an admin-chosen channel.
 *
 * Plan:
 * - Schema: slack_workspaces.digest_channel_id text (null = off). Admin picks a channel on the
 *   admin page (conversations.list needs channels:read; posting needs chat:write and the bot in
 *   the channel, or chat:write.public).
 * - Schedule: pg_cron weekly -> insert one slack_outbox row per linked community
 *   (kind 'weekly_digest', dedupe_key 'digest:<org>:<iso week>'), sent by the existing outbox.
 * - Content (computed in SQL, admin-only style like org_stats): new members this week,
 *   trades completed this week, top contributors by completed trades.
 */
export type WeeklyDigest = {
  orgId: string;
  weekOf: string;
  newMembers: number;
  tradesCompleted: number;
  topContributors: { userId: string; displayName: string; completed: number }[];
};

export function weeklyDigestBlocks(_d: WeeklyDigest): never {
  throw new Error("Weekly digest is Phase 2");
}
