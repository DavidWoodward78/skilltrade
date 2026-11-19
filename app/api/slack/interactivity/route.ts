import { after, NextResponse } from "next/server";
import { slackEnv } from "@/lib/slack/config";
import { readVerifiedBody } from "@/lib/slack/verify";
import { handleCardClick } from "@/lib/slack/flows";
import { slackDeps } from "@/lib/slack/server";

export const runtime = "nodejs";

/** Button clicks ([Interested] / [Pass]). Acknowledged immediately; handled after the response. */
export async function POST(request: Request) {
  const raw = await readVerifiedBody(request, slackEnv().signingSecret);
  if (raw === null) return new NextResponse("invalid signature", { status: 401 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "");
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  after(async () => {
    try {
      await handleCardClick(slackDeps(), payload);
    } catch (e) {
      console.error("[slack] interactivity", e);
    }
  });
  return new NextResponse(null, { status: 200 });
}
