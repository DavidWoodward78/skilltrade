import { after, NextResponse } from "next/server";
import { slackEnv } from "@/lib/slack/config";
import { readVerifiedBody } from "@/lib/slack/verify";
import { handleEvent } from "@/lib/slack/flows";
import { slackDeps } from "@/lib/slack/server";

export const runtime = "nodejs";

/** Events API: url_verification, app_uninstalled, tokens_revoked. */
export async function POST(request: Request) {
  const raw = await readVerifiedBody(request, slackEnv().signingSecret);
  if (raw === null) return new NextResponse("invalid signature", { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
  if (body.type === "url_verification") return NextResponse.json({ challenge: body.challenge });

  // Answer Slack now; do the work after the response (Slack retries after 3 seconds).
  after(async () => {
    try {
      await handleEvent(slackDeps(), body);
    } catch (e) {
      console.error("[slack] event", e);
    }
  });
  return new NextResponse(null, { status: 200 });
}
