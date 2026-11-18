import { NextResponse } from "next/server";
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
    if (!error) {
      return NextResponse.redirect(
        next.includes("/profile") ? withMsg(next, "notice", "Account connected. Your verified badge is on.") : new URL(next, url.origin),
      );
    }
  }
  return NextResponse.redirect(new URL("/login?error=That%20link%20expired.%20Try%20again.", url.origin));
}
