import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email links (password reset, sign-in link, confirm sign-up) land here with a
 * token_hash. Unlike the ?code= flow, this works even when the email is opened in a
 * different browser or app than the one that asked for it (e.g. Gmail's built-in browser).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : "/orgs");
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/orgs";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const msg =
    type === "recovery"
      ? "That reset link has expired or was already used. Request a new one."
      : "That link has expired or was already used. Try again.";
  const target = type === "recovery" ? "/forgot" : "/login";
  return NextResponse.redirect(new URL(`${target}?error=${encodeURIComponent(msg)}`, url.origin));
}
