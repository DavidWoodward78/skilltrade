import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SLACK_PLANS, planIncludesSlack } from "../../lib/slack/plans.ts";
import { PLANS } from "../../lib/plans.ts";

test("Slack plan list is the same in the database, the app and the pricing table", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261119000000_slack.sql", import.meta.url), "utf8");
  const m = sql.match(/slack_plan_includes\(p_plan text\)[\s\S]*?select p_plan in \(([^)]*)\)/);
  assert.ok(m, "slack_plan_includes() found in migration");
  const dbPlans = m[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  assert.deepEqual(dbPlans, [...SLACK_PLANS].sort());
  for (const [id, p] of Object.entries(PLANS)) assert.equal(p.slack, planIncludesSlack(id), `PLANS.${id}.slack`);
});

test("Community plan excludes Slack; trial, pilot, Growth and Enterprise include it", () => {
  assert.equal(planIncludesSlack("community"), false);
  for (const p of ["trial", "pilot", "growth", "enterprise"]) assert.equal(planIncludesSlack(p), true, p);
  assert.equal(planIncludesSlack("bogus"), false);
});
