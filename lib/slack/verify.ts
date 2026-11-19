import { createHmac, timingSafeEqual } from "node:crypto";

/** Slack signs every request; anything older than this is rejected (replay protection). */
export const MAX_AGE_SECONDS = 5 * 60;

/**
 * Checks X-Slack-Signature against the raw request body.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 * Pass the body exactly as received (before any JSON or form parsing).
 */
export function verifySlackSignature(input: {
  signingSecret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs?: number;
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = input;
  if (!signingSecret || !timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - Number(timestamp)) > MAX_AGE_SECONDS) return false;

  const expected = "v0=" + createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reads the raw body and verifies it. Returns the body, or null when the request isn't from Slack. */
export async function readVerifiedBody(request: Request, signingSecret: string | undefined): Promise<string | null> {
  const rawBody = await request.text();
  const ok = verifySlackSignature({
    signingSecret,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    rawBody,
  });
  return ok ? rawBody : null;
}
