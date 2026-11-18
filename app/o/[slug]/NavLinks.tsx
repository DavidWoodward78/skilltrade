"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ICONS: Record<string, React.ReactNode> = {
  Discover: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  Matches: <path d="M4 6h16v10H8l-4 4z" />,
  Trades: <path d="M5 9h12l-3-3M19 15H7l3 3" />,
  Profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" />,
  Admin: <path d="M5 20V10m7 10V4m7 16v-7" />,
};

type Counts = { discover?: number; matches?: number; trades?: number; admin?: number };
const KEY: Record<string, keyof Counts | undefined> = {
  Discover: "discover",
  Matches: "matches",
  Trades: "trades",
  Admin: "admin",
};

export function NavLinks({ slug, orgId, isAdmin }: { slug: string; orgId: string; isAdmin: boolean }) {
  const path = usePathname();
  const base = `/o/${slug}`;
  const [counts, setCounts] = useState<Counts>({});

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("nav_counts", { p_org: orgId });
    if (data) setCounts(data as Counts);
  }, [orgId]);

  // Refresh on every page change, every 30 seconds, and when the app comes back into view
  useEffect(() => {
    load();
  }, [load, path]);
  useEffect(() => {
    const t = setInterval(load, 30000);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    // Other components (e.g. chat) can ask for a refresh
    window.addEventListener("nav-counts:refresh", load);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("nav-counts:refresh", load);
    };
  }, [load]);

  const items = [
    { href: base, label: "Discover", exact: true },
    { href: `${base}/matches`, label: "Matches" },
    { href: `${base}/trades`, label: "Trades" },
    { href: `${base}/profile`, label: "Profile" },
    ...(isAdmin ? [{ href: `${base}/admin`, label: "Admin" }] : []),
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-2xl">
        {items.map((it) => {
          const active = it.exact ? path === it.href || path.startsWith(`${base}/people`) : path.startsWith(it.href);
          const key = KEY[it.label];
          const n = key ? counts[key] ?? 0 : 0;
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-label={n ? `${it.label}, ${n} new` : it.label}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-teal-700" : "text-stone-400"}`}
              >
                <span className="relative">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[it.label]}
                  </svg>
                  {n > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                      {n > 9 ? "9+" : n}
                    </span>
                  )}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
