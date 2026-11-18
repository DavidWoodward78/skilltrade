/** The app's public home. Used for every link people see, copy or share. */
export const DEFAULT_SITE_URL = "https://skilltrade.team";

/**
 * Base URL for links shown or shared (invites, portfolios, profile shares).
 * Uses NEXT_PUBLIC_SITE_URL unless it's unset or an old *.vercel.app address,
 * in which case it falls back to skilltrade.team. Local dev keeps localhost.
 */
export function siteUrl(): string {
  const env = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  if (env.startsWith("http://localhost") || env.startsWith("http://127.0.0.1")) return env;
  if (env && !/\.vercel\.app$/i.test(new URL(env).host)) return env;
  return DEFAULT_SITE_URL;
}
