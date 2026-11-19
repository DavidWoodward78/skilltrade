/**
 * Plans that include Slack. Keep in sync with slack_plan_includes() in the Slack migration and
 * PLANS[...].slack in lib/plans.ts (tests/slack/plans.test.ts checks all three).
 * The database enforces it; this drives the UI and the install route.
 */
export const SLACK_PLANS = ["trial", "pilot", "growth", "enterprise"] as const;

export function planIncludesSlack(plan: string): boolean {
  return (SLACK_PLANS as readonly string[]).includes(plan);
}
