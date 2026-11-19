import { siteUrl } from "@/lib/site";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Slack calls these server-to-server; they authenticate by request signature or CRON_SECRET, not a session.
const SLACK_PATHS = ["/api/slack/events", "/api/slack/interactivity", "/api/slack/commands", "/api/slack/outbox"];
const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot", "/auth", "/p/", "/help/", "/api/stripe/", ...SLACK_PATHS];

/**
 * On the live site, send visitors from the old *.vercel.app address to the real domain.
 * Only runs in production and only once NEXT_PUBLIC_SITE_URL points somewhere else,
 * so preview deployments and local dev are untouched.
 */
function canonicalRedirect(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return null;
  const site = siteUrl(); // skilltrade.team unless NEXT_PUBLIC_SITE_URL names another real domain
  // Server action and API POSTs can't follow a redirect to another host; let them through.
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  let canonical: URL;
  try {
    canonical = new URL(site);
  } catch {
    return null;
  }
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (host === canonical.host) return null;
  // Only the old *.vercel.app address is redirected here. www vs. the bare domain is
  // handled in Vercel's Domains settings; doing it here too can loop with that setting.
  if (!host.endsWith(".vercel.app")) return null;
  const url = request.nextUrl.clone();
  url.protocol = canonical.protocol;
  url.host = canonical.host;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export async function middleware(request: NextRequest) {
  const moved = canonicalRedirect(request);
  if (moved) return moved;

  // If Supabase falls back to the Site URL (e.g. the callback address isn't on its
  // Redirect URLs list), the sign-in code lands on "/" instead of /auth/callback.
  // Finish the sign-in anyway instead of dropping the person on the landing page.
  const code = request.nextUrl.searchParams.get("code");
  // (Slack's "Add to Slack" return also carries ?code= and must reach its own handler.)
  if (code && !request.nextUrl.pathname.startsWith("/auth/") && !request.nextUrl.pathname.startsWith("/api/slack/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    if (request.cookies.get("st_pw_reset")?.value === "1") url.searchParams.set("next", "/reset-password");
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => (p === "/" ? path === "/" : path.startsWith(p)));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
