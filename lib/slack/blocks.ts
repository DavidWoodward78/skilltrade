/** Block Kit messages. Pure functions: no I/O, easy to test. */

export const ACTION_INTERESTED = "skilltrade_card_interested";
export const ACTION_PASS = "skilltrade_card_pass";

export type SkillItem = { category: string; skill: string };
export type InterestContext = {
  org: { id: string; name: string; slug: string };
  from: { id: string; display_name: string; headline: string; offers: SkillItem[]; needs: SkillItem[] };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Block = Record<string, any>;

/** Escape user text for mrkdwn so names can't inject links or @channel mentions. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function skillList(items: SkillItem[]): string {
  if (!items.length) return "_Nothing listed yet_";
  return clip(items.map((i) => `${esc(i.skill)} (${esc(i.category)})`).join(", "), 900);
}

export function profileUrl(siteUrl: string, slug: string, userId: string) {
  return `${siteUrl}/o/${encodeURIComponent(slug)}/people/${userId}`;
}
export function matchUrl(siteUrl: string, slug: string, matchId: string) {
  return `${siteUrl}/o/${encodeURIComponent(slug)}/matches/${matchId}`;
}

/** DM to the person someone is interested in. */
export function interestCard(ctx: InterestContext, cardId: string, siteUrl: string): { text: string; blocks: Block[] } {
  const name = ctx.from.display_name || "A member";
  const text = `${esc(name)} in ${esc(ctx.org.name)} wants to trade skills with you.`;
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${esc(name)}* in *${esc(ctx.org.name)}* wants to trade skills with you.` +
            (ctx.from.headline ? `\n${esc(clip(ctx.from.headline, 200))}` : ""),
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*They offer*\n${skillList(ctx.from.offers)}` },
          { type: "mrkdwn", text: `*They need*\n${skillList(ctx.from.needs)}` },
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${profileUrl(siteUrl, ctx.org.slug, ctx.from.id)}|View their profile in SkillTrade>` }],
      },
      {
        type: "actions",
        block_id: "skilltrade_card",
        elements: [
          { type: "button", action_id: ACTION_INTERESTED, style: "primary", text: { type: "plain_text", text: "Interested" }, value: cardId },
          { type: "button", action_id: ACTION_PASS, text: { type: "plain_text", text: "Pass" }, value: cardId },
        ],
      },
    ],
  };
}

export type CardOutcome = "matched" | "interested" | "passed" | "unavailable" | "closed";

const OUTCOME_TEXT: Record<CardOutcome, string> = {
  matched: ":handshake: You're both in. Check your group DM to agree terms.",
  interested: "Interest sent. You'll match if they're interested too.",
  passed: "You passed. They won't be told.",
  unavailable: "This can't go ahead right now. Open SkillTrade for details.",
  closed: "This is no longer open.",
};

/** The original card with its buttons replaced by the outcome. */
export function decidedCard(original: Block[] | undefined, outcome: CardOutcome, link?: string): Block[] {
  const kept = (original ?? []).filter((b) => b.type !== "actions");
  const line = OUTCOME_TEXT[outcome] + (link ? ` <${link}|Open in SkillTrade>` : "");
  return [...kept, { type: "context", elements: [{ type: "mrkdwn", text: line }] }];
}

export type IntroPerson = { slackUserId: string | null; display_name: string; offers: SkillItem[]; needs: SkillItem[] };

/** First message in the group DM once both said yes. */
export function matchIntro(input: { orgName: string; a: IntroPerson; b: IntroPerson; termsUrl: string }): { text: string; blocks: Block[] } {
  const who = (p: IntroPerson) => (p.slackUserId ? `<@${p.slackUserId}>` : `*${esc(p.display_name || "Member")}*`);
  const text = `It's a match in ${esc(input.orgName)}! Agree your trade terms in SkillTrade.`;
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `:tada: ${who(input.a)} and ${who(input.b)}, you matched in *${esc(input.orgName)}*.` } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*${esc(input.a.display_name || "Member")} offers*\n${skillList(input.a.offers)}` },
          { type: "mrkdwn", text: `*${esc(input.b.display_name || "Member")} offers*\n${skillList(input.b.offers)}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Talk it through here, then put the deal on a Trade Card: what each of you delivers, hours, due date and what \"done\" means." },
        accessory: { type: "button", style: "primary", text: { type: "plain_text", text: "Agree trade terms" }, url: input.termsUrl, action_id: "skilltrade_open_terms" },
      },
    ],
  };
}
