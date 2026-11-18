import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/orgs";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/orgs";
  const withMsg = (path: string, key: "error" | "notice", msg: string) =>
    new URL(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`, url.origin);

  // Provider sent the user back with an error (cancelled, already linked to someone else, etc.)
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    const msg = providerError.toLowerCase().includes("already")
      ? "That account is already connected to a different member."
      : providerError;
    const target = next.startsWith("/o/") ? next : `/login?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(withMsg(target, "error", msg));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const resetPending = (await cookies()).get("st_pw_reset")?.value === "1";
    if (!error && (resetPending || next === "/reset-password")) {
      return NextResponse.redirect(new URL("/reset-password", url.origin));
    }
    if (!error) {
      return NextResponse.redirect(
        next.includes("/profile") ? withMsg(next, "notice", "Account connected. Your verified badge is on.") : new URL(next, url.origin),
      );
    }
  }
  const msg = "That link didn't work. Email links must be opened in the same browser you requested them from. Request a new one and open it there.";
  const back = next === "/reset-password" ? "/forgot" : "/login";
  return NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent(msg)}`, url.origin));
}
