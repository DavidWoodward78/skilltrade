/**
 * In-memory stand-ins for the database and Slack, used by the flow tests.
 * The fake database mirrors the rules of the SQL functions (slack_respond_card etc.);
 * supabase/tests/slack.sql tests the real ones.
 */
import type { Card, Deps, OutboxItem, RespondResult, SlackDb, UserLookup, Workspace } from "../../lib/slack/flows.ts";
import type { InterestContext } from "../../lib/slack/blocks.ts";
import { SlackApiError, type SlackResult } from "../../lib/slack/api.ts";

export const ORG1 = "11111111-1111-1111-1111-111111111111";
export const ORG2 = "22222222-2222-2222-2222-222222222222";
export const ANN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const CAT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

type Member = { org: string; user: string; slack: string | null; name: string };

export function makeWorld() {
  const workspaces: (Workspace & { disabled?: string })[] = [
    { orgId: ORG1, teamId: "T1", token: "xoxb-one" },
    { orgId: ORG2, teamId: "T2", token: "xoxb-two" },
  ];
  const members: Member[] = [
    { org: ORG1, user: ANN, slack: "UANN", name: "Ann" },
    { org: ORG1, user: BOB, slack: null, name: "Bob" },   // found by email
    { org: ORG2, user: CAT, slack: "UCAT", name: "Cat" },
  ];
  const users: Record<string, UserLookup> = {
    [ANN]: { email: "ann@x.com", slackTeamId: "T1", slackUserId: "UANN" },
    [BOB]: { email: "bob@x.com", slackTeamId: null, slackUserId: null },
    [CAT]: { email: "cat@x.com", slackTeamId: "T2", slackUserId: "UCAT" },
  };
  const slackDirectory: Record<string, Record<string, string>> = { T1: { "bob@x.com": "UBOB", "ann@x.com": "UANN" }, T2: { "cat@x.com": "UCAT" } };
  const interests = new Set<string>([`${ORG1}:${ANN}:${BOB}`]);
  const cards: (Card & { org: string; from: string; to: string })[] = [];
  const outbox: (OutboxItem & { status: string; next?: Date; error?: string; result?: unknown })[] = [];
  const matches: { id: string; org: string; a: string; b: string }[] = [];
  const seen = new Set<string>();
  const calls: { token: string; method: string; body: Record<string, unknown> }[] = [];
  let failNext: SlackApiError | null = null;
  let outboxId = 0;

  const enqueue = (org: string, kind: OutboxItem["kind"], payload: Record<string, string>) =>
    outbox.push({ id: ++outboxId, org_id: org, kind, payload, attempts: 0, status: "pending" });

  const member = (org: string, user: string) => members.find((m) => m.org === org && m.user === user);
  const activeWs = (pred: (w: Workspace & { disabled?: string }) => boolean) => workspaces.find((w) => pred(w) && !w.disabled) ?? null;

  const db: SlackDb = {
    async workspaceForOrg(orgId) { return activeWs((w) => w.orgId === orgId); },
    async workspaceForTeam(teamId) { return activeWs((w) => w.teamId === teamId); },
    async interestContext(orgId, from, to): Promise<InterestContext | null> {
      if (!interests.has(`${orgId}:${from}:${to}`) || interests.has(`${orgId}:${to}:${from}`)) return null;
      if (!member(orgId, from) || !member(orgId, to)) return null;
      return {
        org: { id: orgId, name: "Org One", slug: "org-one" },
        from: { id: from, display_name: member(orgId, from)!.name, headline: "Founder", offers: [{ category: "Development", skill: "Next.js" }], needs: [{ category: "Marketing", skill: "SEO" }] },
      };
    },
    async upsertCard(org, from, to) {
      let c = cards.find((x) => x.org === org && x.from === from && x.to === to);
      if (!c) { c = { id: `0000000${cards.length + 1}-0000-0000-0000-000000000000`, org, from, to, state: "pending", channel_id: null, message_ts: null }; cards.push(c); }
      return c;
    },
    async setCardMessage(org, id, ch, ts) { const c = cards.find((x) => x.id === id && x.org === org)!; c.channel_id = ch; c.message_ts = ts; },
    async openCardsBetween(org, a, b) { return cards.filter((c) => c.org === org && c.state === "pending" && ((c.from === a && c.to === b) || (c.from === b && c.to === a))); },
    async setCardState(org, id, state) { const c = cards.find((x) => x.id === id && x.org === org); if (c) c.state = state; },
    async respondCard(cardId, teamId, slackUserId, interested): Promise<RespondResult> {
      const ws = activeWs((w) => w.teamId === teamId);
      const c = cards.find((x) => x.id === cardId && ws && x.org === ws.orgId);
      if (!ws || !c || member(c.org, c.to)?.slack !== slackUserId) return { status: "not_found" };
      if (c.state !== "pending") return { status: "already", state: c.state, match_id: matches.find((m) => m.org === c.org)?.id ?? null };
      if (!interested) { c.state = "passed"; return { status: "passed", state: "passed" }; }
      interests.add(`${c.org}:${c.to}:${c.from}`);
      const m = { id: "99999999-9999-9999-9999-999999999999", org: c.org, a: c.from < c.to ? c.from : c.to, b: c.from < c.to ? c.to : c.from };
      matches.push(m);
      enqueue(c.org, "match_intro", { match_id: m.id, user_a: m.a, user_b: m.b });
      c.state = "matched";
      return { status: "interested", state: "matched", match_id: m.id };
    },
    async memberSlackId(org, user) { const m = member(org, user); return { isMember: !!m, slackUserId: m?.slack ?? null }; },
    async setMemberSlackId(org, user, s) { const m = member(org, user); if (m && !m.slack) m.slack = s; return true; },
    async lookupUser(user) { return users[user]; },
    async matchInfo(org, id) {
      const m = matches.find((x) => x.id === id && x.org === org);
      if (!m) return null;
      return { org: { id: org, name: "Org One", slug: "org-one" }, people: [m.a, m.b].map((u) => ({ id: u, display_name: member(org, u)!.name, offers: [], needs: [] })) };
    },
    async disableTeam(team, reason) { workspaces.filter((w) => w.teamId === team).forEach((w) => (w.disabled = reason)); },
    async firstTime(key) { if (seen.has(key)) return false; seen.add(key); return true; },
    async claimOutbox(limit) {
      const due = outbox.filter((o) => o.status === "pending" && (!o.next || o.next <= new Date(0))).slice(0, limit);
      due.forEach((o) => o.attempts++);
      return due.map((o) => ({ ...o }));
    },
    async finishOutbox(id, status, result, error) { const o = outbox.find((x) => x.id === id)!; o.status = status; o.result = result; o.error = error; },
    async retryOutbox(id, at, error) { const o = outbox.find((x) => x.id === id)!; o.next = at; o.error = error; },
  };

  const slack = async (token: string, method: string, body: Record<string, unknown>): Promise<SlackResult> => {
    calls.push({ token, method, body });
    if (failNext) { const e = failNext; failNext = null; throw e; }
    const team = workspaces.find((w) => w.token === token)!.teamId;
    switch (method) {
      case "users.lookupByEmail": {
        const id = slackDirectory[team][String(body.email)];
        if (!id) throw new SlackApiError(method, "users_not_found");
        return { ok: true, user: { id, team_id: team, deleted: false, is_bot: false } };
      }
      case "conversations.open": return { ok: true, channel: { id: String(body.users).includes(",") ? "GROUP1" : `D-${body.users}` } };
      case "chat.postMessage": return { ok: true, ts: `${calls.length}.000` };
      default: return { ok: true };
    }
  };

  const deps: Deps = { db, slack, siteUrl: "https://skilltrade.team", now: () => new Date(0) };
  return {
    deps, db, calls, cards, outbox, matches, members, workspaces, interests,
    enqueue, failWith: (e: SlackApiError) => { failNext = e; },
  };
}

/** What Slack sends to the interactivity endpoint when a card button is clicked. */
export function click(card: Card, opts: { team: string; user: string; action: "interested" | "pass"; actionTs?: string; blocks?: unknown[] }) {
  return {
    type: "block_actions",
    team: { id: opts.team },
    user: { id: opts.user, team_id: opts.team },
    container: { channel_id: card.channel_id, message_ts: card.message_ts },
    message: { ts: card.message_ts, blocks: opts.blocks ?? [{ type: "section", text: { type: "mrkdwn", text: "*Ann* wants to trade" } }, { type: "actions", elements: [] }] },
    actions: [{ action_id: opts.action === "interested" ? "skilltrade_card_interested" : "skilltrade_card_pass", value: card.id, action_ts: opts.actionTs ?? "1.1" }],
  };
}
