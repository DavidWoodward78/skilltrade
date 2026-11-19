import { test } from "node:test";
import assert from "node:assert/strict";
import { drainOutbox, handleCardClick, handleEvent, backoffSeconds, MAX_ATTEMPTS } from "../../lib/slack/flows.ts";
import { SlackApiError, callSlack } from "../../lib/slack/api.ts";
import { interestCard, esc } from "../../lib/slack/blocks.ts";
import { makeWorld, click, ORG1, ANN, BOB } from "./fakes.ts";

/** Ann tapped Interested on Bob on the web; the trigger queued a card. Send it. */
async function cardSentToBob() {
  const w = makeWorld();
  w.enqueue(ORG1, "interest_card", { from_user: ANN, to_user: BOB });
  await drainOutbox(w.deps);
  const card = w.cards[0];
  return { w, card };
}

test("interest card: Bob is found by email in the linked workspace and DM'd with buttons", async () => {
  const { w, card } = await cardSentToBob();
  assert.ok(w.calls.some((c) => c.method === "users.lookupByEmail" && c.body.email === "bob@x.com"));
  assert.equal(w.members.find((m) => m.user === BOB)?.slack, "UBOB", "Slack id saved for next time");
  const post = w.calls.find((c) => c.method === "chat.postMessage")!;
  assert.equal(post.body.channel, "D-UBOB");
  assert.equal(post.token, "xoxb-one");
  const actions = (post.body.blocks as { type: string; elements?: { action_id: string }[] }[]).find((b) => b.type === "actions")!;
  assert.deepEqual(actions.elements!.map((e) => e.action_id), ["skilltrade_card_interested", "skilltrade_card_pass"]);
  assert.ok(card.message_ts, "message ts stored so the card can be updated");
  assert.equal(w.outbox[0].status, "sent");
});

test("accept / accept: Bob clicks Interested -> card updated, group DM opened with both, link to trade terms", async () => {
  const { w, card } = await cardSentToBob();
  const before = w.calls.length;
  const result = await handleCardClick(w.deps, click(card, { team: "T1", user: "UBOB", action: "interested" }));
  assert.equal(result, "interested");
  const after = w.calls.slice(before);

  const update = after.find((c) => c.method === "chat.update")!;
  assert.equal(update.body.channel, card.channel_id);
  assert.equal(update.body.ts, card.message_ts);
  const blocks = update.body.blocks as { type: string }[];
  assert.ok(!blocks.some((b) => b.type === "actions"), "buttons removed");
  assert.match(JSON.stringify(blocks), /You're both in/);

  const open = after.find((c) => c.method === "conversations.open")!;
  assert.equal(open.body.users, "UANN,UBOB");
  const intro = after.find((c) => c.method === "chat.postMessage")!;
  assert.equal(intro.body.channel, "GROUP1");
  assert.match(JSON.stringify(intro.body.blocks), /https:\/\/skilltrade\.team\/o\/org-one\/matches\/99999999/);
  assert.equal(w.matches.length, 1);
  assert.ok(w.outbox.every((o) => o.status === "sent"));
});

test("accept / pass: Bob clicks Pass -> only his card changes; Ann is told nothing", async () => {
  const { w, card } = await cardSentToBob();
  const before = w.calls.length;
  const result = await handleCardClick(w.deps, click(card, { team: "T1", user: "UBOB", action: "pass" }));
  assert.equal(result, "passed");
  const after = w.calls.slice(before);
  assert.deepEqual(after.map((c) => c.method), ["chat.update"], "nothing but the card update");
  assert.match(JSON.stringify(after[0].body.blocks), /They won't be told/);
  assert.ok(!JSON.stringify(after).includes("UANN"), "no message to or about Ann's Slack user");
  assert.equal(w.matches.length, 0);
  assert.equal(card.state, "passed");
});

test("retried click (same action_ts) is handled once", async () => {
  const { w, card } = await cardSentToBob();
  const payload = click(card, { team: "T1", user: "UBOB", action: "interested", actionTs: "42.1" });
  assert.equal(await handleCardClick(w.deps, payload), "interested");
  const n = w.calls.length;
  assert.equal(await handleCardClick(w.deps, payload), "duplicate");
  assert.equal(w.calls.length, n);
  assert.equal(w.matches.length, 1);
});

test("a second click on an old card can't flip the decision", async () => {
  const { w, card } = await cardSentToBob();
  await handleCardClick(w.deps, click(card, { team: "T1", user: "UBOB", action: "pass", actionTs: "1" }));
  assert.equal(await handleCardClick(w.deps, click(card, { team: "T1", user: "UBOB", action: "interested", actionTs: "2" })), "already");
  assert.equal(w.matches.length, 0);
});

test("community isolation: clicks from another workspace or another user do nothing", async () => {
  const { w, card } = await cardSentToBob();
  const before = w.calls.length;
  assert.equal(await handleCardClick(w.deps, click(card, { team: "T2", user: "UBOB", action: "interested", actionTs: "a" })), "not_found");
  assert.equal(await handleCardClick(w.deps, click(card, { team: "T2", user: "UCAT", action: "interested", actionTs: "b" })), "not_found");
  assert.equal(await handleCardClick(w.deps, click(card, { team: "T1", user: "UANN", action: "interested", actionTs: "c" })), "not_found");
  assert.equal(w.calls.length, before, "no Slack calls, no token use");
  assert.equal(w.matches.length, 0);
});

test("community isolation: a Slack sign-in from another workspace isn't used; only the community's own token is", async () => {
  const w = makeWorld();
  // Bob signed in with Slack in workspace T2, but his community is linked to T1.
  w.members.find((m) => m.user === BOB)!.slack = null;
  (await w.db.lookupUser(BOB)).slackTeamId = "T2";
  (await w.db.lookupUser(BOB)).slackUserId = "UFOREIGN";
  w.enqueue(ORG1, "interest_card", { from_user: ANN, to_user: BOB });
  await drainOutbox(w.deps);
  assert.ok(!JSON.stringify(w.calls).includes("UFOREIGN"));
  assert.ok(w.calls.every((c) => c.token === "xoxb-one"));
  assert.equal(w.members.find((m) => m.user === BOB)?.slack, "UBOB");
});

test("unknown actions (e.g. the 'Agree trade terms' link button) are ignored", async () => {
  const { w } = await cardSentToBob();
  const n = w.calls.length;
  assert.equal(await handleCardClick(w.deps, { type: "block_actions", team: { id: "T1" }, user: { id: "UBOB" }, actions: [{ action_id: "skilltrade_open_terms" }] }), "ignored");
  assert.equal(w.calls.length, n);
});

test("rate limited (429 with Retry-After) -> outbox retries at that time", async () => {
  const w = makeWorld();
  w.enqueue(ORG1, "interest_card", { from_user: ANN, to_user: BOB });
  w.failWith(new SlackApiError("users.lookupByEmail", "ratelimited", 30));
  await drainOutbox(w.deps);
  assert.equal(w.outbox[0].status, "pending");
  assert.equal(w.outbox[0].next!.getTime(), 30_000);
  assert.equal(w.outbox[0].error, "ratelimited");
});

test("revoked token disables the workspace link; permanent errors stop retrying; retries cap out", async () => {
  const w = makeWorld();
  w.enqueue(ORG1, "interest_card", { from_user: ANN, to_user: BOB });
  w.failWith(new SlackApiError("users.lookupByEmail", "token_revoked"));
  await drainOutbox(w.deps);
  assert.equal(w.workspaces[0].disabled, "token_revoked");
  assert.equal(w.outbox[0].status, "skipped");

  const w2 = makeWorld();
  w2.enqueue(ORG1, "interest_card", { from_user: ANN, to_user: BOB });
  w2.failWith(new SlackApiError("chat.postMessage", "channel_not_found"));
  await drainOutbox(w2.deps);
  assert.equal(w2.outbox[0].status, "failed");

  const w3 = makeWorld();
  w3.enqueue(ORG1, "interest_card", { from_user: ANN, to_user: BOB });
  w3.outbox[0].attempts = MAX_ATTEMPTS - 1;
  w3.failWith(new SlackApiError("chat.postMessage", "internal_error"));
  await drainOutbox(w3.deps);
  assert.equal(w3.outbox[0].status, "failed");
  assert.equal(backoffSeconds(1), 30);
  assert.equal(backoffSeconds(20), 3600);
});

test("a match made on the web closes Bob's open card and still opens the group DM", async () => {
  const { w, card } = await cardSentToBob();
  w.matches.push({ id: "99999999-9999-9999-9999-999999999999", org: ORG1, a: ANN < BOB ? ANN : BOB, b: ANN < BOB ? BOB : ANN });
  w.enqueue(ORG1, "match_intro", { match_id: "99999999-9999-9999-9999-999999999999", user_a: ANN, user_b: BOB });
  const before = w.calls.length;
  await drainOutbox(w.deps);
  const after = w.calls.slice(before);
  assert.equal(card.state, "matched");
  assert.ok(after.some((c) => c.method === "chat.update" && c.body.ts === card.message_ts));
  assert.ok(after.some((c) => c.method === "conversations.open" && c.body.users === "UANN,UBOB"));
});

test("events: uninstall and bot-token revocation disable the link; duplicates and user-token revocations don't", async () => {
  const w = makeWorld();
  assert.equal(await handleEvent(w.deps, { type: "event_callback", event_id: "Ev1", team_id: "T1", event: { type: "tokens_revoked", tokens: { oauth: ["U1"] } } }), "ignored");
  assert.equal(w.workspaces[0].disabled, undefined);
  assert.equal(await handleEvent(w.deps, { type: "event_callback", event_id: "Ev2", team_id: "T1", event: { type: "app_uninstalled" } }), "disabled");
  assert.equal(w.workspaces[0].disabled, "app_uninstalled");
  assert.equal(await handleEvent(w.deps, { type: "event_callback", event_id: "Ev2", team_id: "T1", event: { type: "app_uninstalled" } }), "duplicate");
  assert.equal(w.workspaces[1].disabled, undefined, "other community untouched");
  // after uninstall, nothing is sent for that community
  w.enqueue(ORG1, "interest_card", { from_user: ANN, to_user: BOB });
  const n = w.calls.length;
  await drainOutbox(w.deps);
  assert.equal(w.calls.length, n);
  assert.equal(w.outbox.at(-1)!.status, "skipped");
});

test("callSlack retries a short 429 in place, and hands long waits back to the outbox", async () => {
  const sleeps: number[] = [];
  let n = 0;
  const fetch429Then200 = async () => {
    n++;
    return n === 1
      ? new Response("", { status: 429, headers: { "retry-after": "2" } })
      : new Response(JSON.stringify({ ok: true, ts: "1.0" }), { status: 200 });
  };
  const r = await callSlack("chat.postMessage", "xoxb", {}, { fetch: fetch429Then200, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(r.ts, "1.0");
  assert.deepEqual(sleeps, [2000]);

  const always429 = async () => new Response("", { status: 429, headers: { "retry-after": "45" } });
  await assert.rejects(callSlack("chat.postMessage", "xoxb", {}, { fetch: always429, sleep: async () => {} }),
    (e: unknown) => e instanceof SlackApiError && e.code === "ratelimited" && e.retryAfter === 45);

  const notOk = async () => new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 });
  await assert.rejects(callSlack("chat.postMessage", "xoxb", {}, { fetch: notOk }), (e: unknown) => e instanceof SlackApiError && e.code === "channel_not_found");
});

test("member-supplied text can't inject mentions or links into Slack messages", () => {
  assert.equal(esc("<!channel> <https://evil|click> & co"), "&lt;!channel&gt; &lt;https://evil|click&gt; &amp; co");
  const msg = interestCard({
    org: { id: ORG1, name: "Org <!here>", slug: "org-one" },
    from: { id: ANN, display_name: "<!channel>", headline: "", offers: [{ category: "Dev", skill: "<@U123>" }], needs: [] },
  }, "card", "https://skilltrade.team");
  const json = JSON.stringify(msg);
  assert.ok(!json.includes("<!channel>") && !json.includes("<!here>") && !json.includes("<@U123>"));
});
