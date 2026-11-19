/**
 * PHASE 2 STUB: /skilltrade slash command.
 *
 * Plan:
 * - Manifest: add `commands` bot scope and a slash command pointing at /api/slack/commands.
 * - `/skilltrade offer <skill>` / `/skilltrade need <skill>`: map the Slack user to a member via
 *   memberships(org_id, slack_user_id) for the workspace's community, then open a modal
 *   (views.open, needs the trigger_id) to pick a category and level, and save to user_skills.
 * - Respect the 5-offer / 5-need limit and the community's active plan.
 */
export type ParsedCommand = { kind: "offer" | "need"; text: string } | { kind: "help" };

export function parseSkilltradeCommand(text: string): ParsedCommand {
  const [verb, ...rest] = text.trim().split(/\s+/);
  const v = (verb ?? "").toLowerCase();
  if ((v === "offer" || v === "need") && rest.length) return { kind: v, text: rest.join(" ").slice(0, 80) };
  return { kind: "help" };
}
