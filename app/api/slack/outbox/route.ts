import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { slackEnv } from "@/lib/slack/config";
import { kickSlackOutbox } from "@/lib/slack/server";

export const runtime = "nodejs";

/**
 * Retry sweep for Slack notifications that failed or were rate limited.
 * Notifications normally go out immediately; this only picks up stragglers.
 * Call every few minutes with `Authorization: Bearer $CRON_SECRET` (see SETUP.md).
 */
async function run(request: Request) {
  const secret = slackEnv().cronSecret;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const processed = await kickSlackOutbox(50);
  return NextResponse.json({ processed });
}

export const GET = run;
export const POST = run;
