"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  Discover: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  Matches: <path d="M4 6h16v10H8l-4 4z" />,
  Trades: <path d="M5 9h12l-3-3M19 15H7l3 3" />,
  Profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" />,
  Admin: <path d="M5 20V10m7 10V4m7 16v-7" />,
};

export function NavLinks({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const path = usePathname();
  const base = `/o/${slug}`;
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
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-teal-700" : "text-stone-400"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[it.label]}
                </svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
