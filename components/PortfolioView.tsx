import Link from "next/link";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { GitHubIcon, LinkedInIcon, VerifiedBadges } from "./Verified";
import { pct } from "./ui";

export type Portfolio = {
  name: string;
  username: string;
  headline: string;
  bio: string;
  avatar_url: string;
  link: string;
  member_since: string;
  verified_github?: string | null;
  verified_linkedin?: boolean;
  stats: {
    trades_completed: number;
    completion_rate: number | null;
    on_time_rate: number | null;
    avg_rating: number | null;
    review_count: number;
    unique_partners: number;
  } | null;
  trades: {
    delivered: string;
    hours: number;
    received: string;
    completed_at: string;
    on_time: boolean | null;
    proof: { title: string; url: string }[];
    review: { rating: number; comment: string } | null;
    partner_verified?: boolean;
    partner: { name: string; avatar_url: string; username: string | null; verified?: boolean } | null;
  }[];
};

const month = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export function PortfolioView({ p }: { p: Portfolio }) {
  const st = p.stats;
  const stats = [
    { v: String(st?.trades_completed ?? 0), l: `Trades with ${st?.unique_partners ?? 0} partner${st?.unique_partners === 1 ? "" : "s"}` },
    { v: pct(st?.completion_rate), l: "Completion rate" },
    { v: pct(st?.on_time_rate), l: "On time" },
    { v: st?.avg_rating ? `${st.avg_rating}★` : "—", l: st?.review_count ? `${st.review_count} reviews` : "Rating" },
  ];

  return (
    <main className="min-h-dvh bg-[#f7f6f3]">
      <section className="bg-gradient-to-b from-teal-900 to-teal-700 px-6 pb-32 pt-5 text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo light />
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">Verified portfolio</span>
        </div>
      </section>

      <div className="mx-auto -mt-16 max-w-2xl px-5 pb-16">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-xl shadow-stone-900/5">
          <div className="-mt-20 flex justify-center">
            <Avatar name={p.name} url={p.avatar_url} size={112} className="shadow-lg ring-4 ring-white" />
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{p.name}</h1>
          {p.headline && <p className="mt-1 text-stone-600">{p.headline}</p>}
          {(p.verified_linkedin || p.verified_github) && (
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs font-medium">
              {p.verified_linkedin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-sky-800 ring-1 ring-inset ring-sky-600/15">
                  <LinkedInIcon size={12} /> LinkedIn verified
                </span>
              )}
              {p.verified_github && (
                <a href={`https://github.com/${p.verified_github}`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-sky-800 ring-1 ring-inset ring-sky-600/15">
                  <GitHubIcon size={12} /> @{p.verified_github} ↗
                </a>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-stone-400">Trading skills since {month(p.member_since)}</p>
          {p.link && (
            <a href={p.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-sm font-medium text-teal-700">
              {host(p.link)} ↗
            </a>
          )}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {stats.map((s) => (
              <div key={s.l} className="rounded-2xl bg-stone-50 px-1 py-3">
                <p className="text-xl font-bold">{s.v}</p>
                <p className="text-[11px] leading-tight text-stone-500">{s.l}</p>
              </div>
            ))}
          </div>
          {p.bio && <p className="mt-5 whitespace-pre-line text-left text-sm text-stone-700">{p.bio}</p>}
        </div>

        <h2 className="mb-3 mt-8 text-lg font-bold tracking-tight">Completed work</h2>
        {p.trades.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No completed trades to show yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {p.trades.map((t, i) => (
              <li key={i} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Delivered</p>
                    <p className="mt-0.5 text-lg font-semibold leading-snug">{t.delivered}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {t.hours} hrs · {month(t.completed_at)}
                      {t.on_time && <span className="ml-1 text-emerald-700">· on time</span>}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/15">
                    ✓ Verified
                  </span>
                </div>

                {t.proof.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.proof.map((pr, j) => (
                      <a
                        key={j}
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-teal-800 hover:border-teal-600"
                      >
                        {pr.title} ↗
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-stone-50 p-3">
                  {t.partner ? (
                    <Avatar name={t.partner.name} url={t.partner.avatar_url} size={36} />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-500">✓</span>
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {t.partner ? (
                        t.partner.username ? (
                          <Link href={`/p/${t.partner.username}`} className="hover:underline">{t.partner.name}</Link>
                        ) : (
                          t.partner.name
                        )
                      ) : (
                        t.partner_verified ? "ID-verified trade partner" : "Trade partner"
                      )}
                      {t.partner?.verified && <span className="ml-1"><VerifiedBadges linkedin /></span>}
                      {t.review && <span className="ml-2 text-amber-500">{"★".repeat(t.review.rating)}</span>}
                    </p>
                    {t.review?.comment ? (
                      <p className="text-stone-600">“{t.review.comment}”</p>
                    ) : (
                      <p className="text-stone-500">Confirmed delivery</p>
                    )}
                    <p className="mt-1 text-xs text-stone-400">In return: {t.received}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 rounded-3xl bg-stone-900 p-6 text-center text-white">
          <p className="text-lg font-semibold">Build a track record like this</p>
          <p className="mt-1 text-sm text-stone-300">Trade skills with other builders. Every finished trade is verified by your partner.</p>
          <Link href="/" className="mt-4 inline-block rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-stone-900">
            Get started free
          </Link>
        </div>
      </div>
    </main>
  );
}
