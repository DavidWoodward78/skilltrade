import { NextResponse } from "next/server";
import { slackEnv } from "@/lib/slack/config";
import { readVerifiedBody } from "@/lib/slack/verify";
import { parseSkilltradeCommand } from "@/lib/slack/phase2/command";

export const runtime = "nodejs";

/**
 * PHASE 2 STUB: /skilltrade slash command. Not registered in the Phase 1 manifest.
 * Verifies the request and replies privately that it's coming soon.
 */
export async function POST(request: Request) {
  const raw = await readVerifiedBody(request, slackEnv().signingSecret);
  if (raw === null) return new NextResponse("invalid signature", { status: 401 });
  const form = new URLSearchParams(raw);
  const parsed = parseSkilltradeCommand(form.get("text") ?? "");
  return NextResponse.json({
    response_type: "ephemeral",
    text: parsed.kind === "help"
      ? "Coming soon: `/skilltrade offer <skill>` and `/skilltrade need <skill>`."
      : `Coming soon: posting your ${parsed.kind} from Slack. For now, add it in SkillTrade.`,
  });
}
