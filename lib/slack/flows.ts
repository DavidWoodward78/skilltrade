/**
 * Slack flows, written against small interfaces so they can be tested without Slack or Supabase.
 * The real implementations live in lib/slack/server.ts.
 *
 * Every database call here is scoped by a community (org) id, and the database functions
 * re-check that scope (see supabase/migrations/20261119000000_slack.sql).
 */
import { AUTH_ERRORS, PERMANENT_ERRORS, SlackApiError, type SlackResult } from "./api.ts";
import {
  ACTION_INTERESTED, ACTION_PASS, decidedCard, interestCard, matchIntro, matchUrl,
  type Block, type CardOutcome, type InterestContext, type SkillItem,
} from "./blocks.ts";

export type Workspace = { orgId: string; teamId: string; token: string };
export type Card = { id: string; state: string; channel_id: string | null; message_ts: string | null };
export type OutboxItem = { id: number; org_id: string; kind: "interest_card" | "match_intro"; payload: Record<string, string>; attempts: number };
export type RespondResult = { status: "interested" | "passed" | "already" | "unavailable" | "not_found"; state?: string; match_id?: string | null };
export type MatchInfo = {
  org: { id: string; name: string; slug: string };
  people: { id: string; display_name: string; offers: SkillItem[]; needs: SkillItem[] }[];
};
export type UserLookup = { email: string | null; slackTeamId: string | null; slackUserId: string | null };

export interface SlackDb {
  /** Active link for this community, with the token decrypted. */
  workspaceForOrg(orgId: string): Promise<Workspace | null>;
  workspaceForTeam(teamId: string): Promise<Workspace | null>;
  interestContext(orgId: string, from: string, to: string): Promise<InterestContext | null>;
  upsertCard(orgId: string, from: string, to: string): Promise<Card>;
  setCardMessage(orgId: string, cardId: string, channelId: string, ts: string): Promise<void>;
  /** Cards between two members still showing buttons. */
  openCardsBetween(orgId: string, a: string, b: string): Promise<Card[]>;
  setCardState(orgId: string, cardId: string, state: string): Promise<void>;
  respondCard(cardId: string, teamId: string, slackUserId: string, interested: boolean): Promise<RespondResult>;
  memberSlackId(orgId: string, userId: string): Promise<{ isMember: boolean; slackUserId: string | null }>;
  setMemberSlackId(orgId: string, userId: string, slackUserId: string): Promise<boolean>;
  lookupUser(userId: string): Promise<UserLookup>;
  matchInfo(orgId: string, matchId: string): Promise<MatchInfo | null>;
  disableTeam(teamId: string, reason: string): Promise<void>;
  /** Records a key; false if it was already seen (Slack retry). */
  firstTime(key: string): Promise<boolean>;
  claimOutbox(limit: number): Promise<OutboxItem[]>;
  finishOutbox(id: number, status: "sent" | "skipped" | "failed", result: unknown, error?: string): Promise<void>;
  retryOutbox(id: number, at: Date, error: string): Promise<void>;
}

export type Slack = (token: string, method: string, body: Record<string, unknown>) => Promise<SlackResult>;

export type Deps = { db: SlackDb; slack: Slack; siteUrl: string; now?: () => Date };

// ---------------------------------------------------------------------------
// Who is this member in Slack?
// ---------------------------------------------------------------------------

/**
 * The member's Slack user id in their community's workspace:
 * 1) already stored on the membership, 2) their Slack sign-in identity (same workspace only),
 * 3) users.lookupByEmail in the linked workspace. Found ids are saved for next time.
 */
export async function resolveSlackUser(deps: Deps, ws: Workspace, userId: string): Promise<string | null> {
  const m = await deps.db.memberSlackId(ws.orgId, userId);
  if (!m.isMember) return null;
  if (m.slackUserId) return m.slackUserId;

  const u = await deps.db.lookupUser(userId);
  let found: string | null = null;
  if (u.slackTeamId === ws.teamId && u.slackUserId) {
    found = u.slackUserId;
  } else if (u.email) {
    try {
      const r = await deps.slack(ws.token, "users.lookupByEmail", { email: u.email });
      const su = r.user;
      if (su && !su.deleted && !su.is_bot && (!su.team_id || su.team_id === ws.teamId)) found = String(su.id);
    } catch (e) {
      if (!(e instanceof SlackApiError && (e.code === "users_not_found" || e.code === "user_not_found"))) throw e;
    }
  }
  if (found) await deps.db.setMemberSlackId(ws.orgId, userId, found);
  return found;
}

async function openDm(deps: Deps, ws: Workspace, users: string[]): Promise<string> {
  const r = await deps.slack(ws.token, "conversations.open", { users: users.join(","), return_im: false });
  return String(r.channel.id);
}

// ---------------------------------------------------------------------------
// Outbox: interest card
// ---------------------------------------------------------------------------

export type SendResult = { status: "sent" | "skipped"; result: Record<string, unknown> };

export async function sendInterestCard(deps: Deps, item: OutboxItem): Promise<SendResult> {
  const { from_user: from, to_user: to } = item.payload;
  const ws = await deps.db.workspaceForOrg(item.org_id);
  if (!ws) return { status: "skipped", result: { reason: "not_linked" } };
  const ctx = await deps.db.interestContext(item.org_id, from, to);
  if (!ctx) return { status: "skipped", result: { reason: "no_longer_relevant" } };

  const card = await deps.db.upsertCard(item.org_id, from, to);
  if (card.message_ts) return { status: "sent", result: { already: true, card: card.id } };
  if (card.state !== "pending") return { status: "skipped", result: { reason: `card_${card.state}` } };

  const recipient = await resolveSlackUser(deps, ws, to);
  if (!recipient) return { status: "skipped", result: { reason: "no_slack_user" } };

  const channel = await openDm(deps, ws, [recipient]);
  const msg = interestCard(ctx, card.id, deps.siteUrl);
  const posted = await deps.slack(ws.token, "chat.postMessage", { channel, text: msg.text, blocks: msg.blocks, unfurl_links: false });
  await deps.db.setCardMessage(item.org_id, card.id, channel, String(posted.ts));
  return { status: "sent", result: { card: card.id, channel, ts: posted.ts } };
}

// ---------------------------------------------------------------------------
// Outbox: match intro (group DM)
// ---------------------------------------------------------------------------

export async function sendMatchIntro(deps: Deps, item: OutboxItem): Promise<SendResult> {
  const { match_id: matchId, user_a: a, user_b: b } = item.payload;
  const ws = await deps.db.workspaceForOrg(item.org_id);
  if (!ws) return { status: "skipped", result: { reason: "not_linked" } };
  const info = await deps.db.matchInfo(item.org_id, matchId);
  if (!info) return { status: "skipped", result: { reason: "match_gone" } };
  const link = matchUrl(deps.siteUrl, info.org.slug, matchId);

  // A card for this pair may still show buttons (e.g. they matched on the web). Close it.
  for (const card of await deps.db.openCardsBetween(item.org_id, a, b)) {
    await deps.db.setCardState(item.org_id, card.id, "matched");
    if (card.channel_id && card.message_ts) {
      try {
        await deps.slack(ws.token, "chat.update", { channel: card.channel_id, ts: card.message_ts, text: "You matched.", blocks: decidedCard([], "matched", link) });
      } catch (e) {
        if (!(e instanceof SlackApiError && PERMANENT_ERRORS.has(e.code))) throw e;
      }
    }
  }

  const ua = await resolveSlackUser(deps, ws, a);
  const ub = await resolveSlackUser(deps, ws, b);
  const users = [ua, ub].filter((x): x is string => !!x);
  if (!users.length) return { status: "skipped", result: { reason: "no_slack_users" } };

  const person = (id: string, slackUserId: string | null) => {
    const p = info.people.find((x) => x.id === id);
    return { slackUserId, display_name: p?.display_name ?? "", offers: p?.offers ?? [], needs: p?.needs ?? [] };
  };
  // Both in Slack: one group DM. Only one: a 1:1 DM so they still hear about it.
  const channel = await openDm(deps, ws, users);
  const msg = matchIntro({ orgName: info.org.name, a: person(a, ua), b: person(b, ub), termsUrl: link });
  const posted = await deps.slack(ws.token, "chat.postMessage", { channel, text: msg.text, blocks: msg.blocks, unfurl_links: false });
  return { status: "sent", result: { channel, ts: posted.ts, group: users.length === 2 } };
}

// ---------------------------------------------------------------------------
// Outbox runner: retries with backoff, honours Retry-After
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = 6;

export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

export async function processOutboxItem(deps: Deps, item: OutboxItem): Promise<void> {
  const now = deps.now?.() ?? new Date();
  try {
    const r = item.kind === "interest_card" ? await sendInterestCard(deps, item) : await sendMatchIntro(deps, item);
    await deps.db.finishOutbox(item.id, r.status, r.result);
  } catch (e) {
    const code = e instanceof SlackApiError ? e.code : e instanceof Error ? e.message : String(e);
    if (e instanceof SlackApiError && AUTH_ERRORS.has(e.code)) {
      const ws = await deps.db.workspaceForOrg(item.org_id);
      if (ws) await deps.db.disableTeam(ws.teamId, e.code);
      await deps.db.finishOutbox(item.id, "skipped", { reason: "auth" }, code);
      return;
    }
    if (e instanceof SlackApiError && PERMANENT_ERRORS.has(e.code)) {
      await deps.db.finishOutbox(item.id, "failed", null, code);
      return;
    }
    if (item.attempts >= MAX_ATTEMPTS) {
      await deps.db.finishOutbox(item.id, "failed", null, code);
      return;
    }
    const wait = e instanceof SlackApiError && e.retryAfter ? e.retryAfter : backoffSeconds(item.attempts);
    await deps.db.retryOutbox(item.id, new Date(now.getTime() + wait * 1000), code);
  }
}

/** Sends what's due. Items run one at a time to stay well inside Slack's per-workspace limits. */
export async function drainOutbox(deps: Deps, limit = 20): Promise<number> {
  const items = await deps.db.claimOutbox(limit);
  for (const item of items) await processOutboxItem(deps, item);
  return items.length;
}

// ---------------------------------------------------------------------------
// Interactivity: [Interested] / [Pass]
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockActionsPayload = Record<string, any>;

/** Returns what happened, for logging/tests. Runs after Slack has already been answered. */
export async function handleCardClick(deps: Deps, payload: BlockActionsPayload): Promise<string> {
  if (payload?.type !== "block_actions") return "ignored";
  const action = (payload.actions ?? []).find((a: Block) => a.action_id === ACTION_INTERESTED || a.action_id === ACTION_PASS);
  if (!action) return "ignored";
  const teamId = String(payload.team?.id ?? payload.user?.team_id ?? "");
  const slackUserId = String(payload.user?.id ?? "");
  const cardId = String(action.value ?? "");
  if (!teamId || !slackUserId || !/^[0-9a-f-]{36}$/i.test(cardId)) return "ignored";

  if (!(await deps.db.firstTime(`action:${cardId}:${action.action_ts ?? ""}`))) return "duplicate";

  const res = await deps.db.respondCard(cardId, teamId, slackUserId, action.action_id === ACTION_INTERESTED);
  if (res.status === "not_found") return "not_found";

  const ws = await deps.db.workspaceForTeam(teamId);
  const outcome: CardOutcome =
    res.status === "unavailable" ? "unavailable"
    : res.state === "passed" ? "passed"
    : res.state === "matched" ? "matched"
    : res.state === "interested" ? "interested"
    : "closed";
  const channel = payload.container?.channel_id ?? payload.channel?.id;
  const ts = payload.container?.message_ts ?? payload.message?.ts;
  if (ws && channel && ts) {
    // No link on the card itself: the group DM carries the link to the trade terms.
    await deps.slack(ws.token, "chat.update", {
      channel, ts, text: outcome === "matched" ? "You matched." : "Done.", blocks: decidedCard(payload.message?.blocks, outcome),
    });
  }
  // A new match queues the group-DM intro; send it now rather than waiting for the sweep.
  if (res.status === "interested") await drainOutbox(deps);
  return res.status;
}

// ---------------------------------------------------------------------------
// Events API
// ---------------------------------------------------------------------------

export async function handleEvent(deps: Deps, body: BlockActionsPayload): Promise<string> {
  if (body?.type !== "event_callback") return "ignored";
  const eventId = String(body.event_id ?? "");
  if (eventId && !(await deps.db.firstTime(`event:${eventId}`))) return "duplicate";
  const teamId = String(body.team_id ?? "");
  const ev = body.event ?? {};
  if (ev.type === "app_uninstalled") {
    await deps.db.disableTeam(teamId, "app_uninstalled");
    return "disabled";
  }
  if (ev.type === "tokens_revoked" && Array.isArray(ev.tokens?.bot) && ev.tokens.bot.length > 0) {
    await deps.db.disableTeam(teamId, "tokens_revoked");
    return "disabled";
  }
  return "ignored";
}
