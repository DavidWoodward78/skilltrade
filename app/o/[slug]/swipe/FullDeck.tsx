"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fitLabel, type Person } from "@/components/PersonCard";
import { PhotoPanel } from "@/components/Avatar";
import { VerifiedBadges } from "@/components/Verified";
import { Reputation, type Rep } from "@/components/Reputation";
import { Chip } from "@/components/ui";
import { LEVELS } from "@/lib/constants";
import { siteUrl } from "@/lib/site";
import { swipeInterest } from "../actions";

export type DeckPerson = Person & {
  bio: string;
  portfolio_url: string;
  rep: Rep | null;
  reviews: { rating: number; comment: string }[];
};

const roundBtn = "flex items-center justify-center rounded-full shadow-lg transition active:scale-90 disabled:opacity-40";

export function FullDeck({ slug, orgId, people, hasSkills }: { slug: string; orgId: string; people: DeckPerson[]; hasSkills: boolean }) {
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [dx, setDx] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startX = useRef<number | null>(null);
  const router = useRouter();
  const exitHref = `/o/${slug}`;

  const p = people[index];
  const nextP = people[index + 1];
  const alreadySent = p ? sent.has(p.user_id) : false;

  // Full-screen page: stop the page behind it from scrolling
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Messages fade after a few seconds
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  function next() {
    setDx(0);
    setIndex((i) => i + 1);
  }
  function back() {
    setMsg(null);
    setDx(0);
    setIndex((i) => Math.max(0, i - 1));
  }
  function reset() {
    setMsg(null);
    setDx(0);
    setIndex(0);
    router.refresh();
  }
  function skip() {
    if (pending) return;
    setMsg(null);
    next();
  }
  function yes() {
    if (!p || pending) return;
    if (alreadySent) return next();
    const who = p;
    start(async () => {
      let res: { error?: string; matchId?: string };
      try {
        res = await swipeInterest(orgId, slug, who.user_id);
      } catch {
        res = { error: "Something went wrong. Try again." };
      }
      if (res.error) return setMsg(res.error);
      if (res.matchId) return router.push(`/o/${slug}/matches/${res.matchId}?notice=${encodeURIComponent("It's a match!")}`);
      setSent((s) => new Set(s).add(who.user_id));
      setMsg(`Interest sent to ${who.display_name || "them"}.`);
      next();
    });
  }
  async function share() {
    if (!p) return;
    const url = `${siteUrl()}/o/${slug}/people/${p.user_id}`;
    const text = `${p.display_name || "This member"} on SkillTrade${p.headline ? `: ${p.headline}` : ""}`;
    try {
      if (navigator.share) return void (await navigator.share({ title: p.display_name, text, url }));
      await navigator.clipboard.writeText(url);
      setMsg("Profile link copied. Members of this community can open it.");
    } catch {
      // share sheet dismissed
    }
  }

  // Arrow keys on a computer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") yes();
      else if (e.key === "ArrowLeft") skip();
      else if (e.key === "Escape") router.push(exitHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const closeBtn = (
    <Link
      href={exitHref}
      aria-label="Close swipe"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition active:scale-95"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </Link>
  );

  // Empty deck or end of deck: a full-screen message
  if (people.length === 0 || !p) {
    const empty = people.length === 0;
    return (
      <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-stone-950 text-white">
        <div className="flex justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">{closeBtn}</div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          {empty ? (
            <>
              <p className="text-xl font-semibold">{hasSkills ? "No mutual fits right now" : "Add your skills to see who fits you"}</p>
              <p className="mt-2 text-sm text-white/70">
                {hasSkills
                  ? "Check back as new members join, or add more skills to widen your matches."
                  : "Swipe shows people who need what you offer, or offer what you need."}
              </p>
              <Link href={`/o/${slug}/profile`} className="mt-6 rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-white">
                {hasSkills ? "Edit my skills" : "Add my skills"}
              </Link>
            </>
          ) : (
            <>
              <p className="text-xl font-semibold">You&apos;ve seen everyone for now</p>
              <p className="mt-2 text-sm text-white/70">
                {sent.size > 0
                  ? `You sent interest to ${sent.size}. You'll match if they say yes too.`
                  : "Go back over people you skipped, or check again as new members join."}
              </p>
              <div className="mt-6 flex gap-3">
                <button onClick={back} className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold">
                  ← Back
                </button>
                <button onClick={reset} className="rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold">
                  Start over
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const fit = fitLabel(p);
  const first = (p.display_name || "them").split(" ")[0];

  return (
    <div className="fixed inset-0 z-50 h-dvh overflow-hidden bg-stone-950">
      {/* Next person peeking behind */}
      {nextP && (
        <div className="absolute inset-0 scale-95 opacity-40" aria-hidden="true">
          <PhotoPanel name={nextP.display_name || "New member"} url={nextP.avatar_url} className="h-full rounded-none" />
        </div>
      )}

      {/* The current person: scroll down for the full profile, swipe sideways to decide */}
      <div
        key={p.user_id}
        className="absolute inset-0 touch-pan-y select-none overflow-y-auto overscroll-contain bg-white text-stone-900 transition-transform duration-75"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) return;
          startX.current = e.clientX;
        }}
        onPointerMove={(e) => startX.current !== null && setDx(e.clientX - startX.current)}
        onPointerUp={() => {
          if (startX.current === null) return;
          startX.current = null;
          if (dx > 100) yes();
          else if (dx < -100) skip();
          else setDx(0);
        }}
        onPointerCancel={() => {
          startX.current = null;
          setDx(0);
        }}
      >
        <PhotoPanel name={p.display_name || "New member"} url={p.avatar_url} className="h-[calc(100dvh-5.5rem)] rounded-none">
          <div className="pb-24">
            {fit && <span className="mb-2 inline-block rounded-full bg-teal-500 px-2.5 py-0.5 text-xs font-semibold text-white">{fit.text}</span>}
            <p className="flex flex-wrap items-center gap-2 text-3xl font-bold leading-tight">
              {p.display_name || "New member"} <VerifiedBadges github={p.verified_github} linkedin={p.verified_linkedin} dark />
            </p>
            {p.headline && <p className="mt-0.5 text-base text-white/90">{p.headline}</p>}
            {p.availability && <p className="mt-1 text-sm text-white/70">Available {p.availability}</p>}
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-white/80">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
              Scroll for {first}&apos;s full profile
            </p>
          </div>
        </PhotoPanel>

        <div className="space-y-6 px-5 pb-40 pt-6">
          <Section title="Offers">
            <Skills skills={p.offers} tone="teal" showLevel />
          </Section>
          <Section title="Needs">
            <Skills skills={p.needs} tone="amber" />
          </Section>
          {p.bio && (
            <Section title="About">
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-stone-700">{p.bio}</p>
            </Section>
          )}
          {p.portfolio_url && (
            <Section title="Work">
              <a href={p.portfolio_url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm font-medium text-teal-700 underline">
                {p.portfolio_url}
              </a>
            </Section>
          )}
          <Section title="Track record">
            <Reputation rep={p.rep} />
          </Section>
          <Section title="Reviews">
            {p.reviews.length === 0 ? (
              <p className="text-sm text-stone-500">No reviews yet.</p>
            ) : (
              <ul className="space-y-2">
                {p.reviews.map((r, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-amber-600">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </span>{" "}
                    <span className="text-stone-700">{r.comment}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Link href={`/o/${slug}/people/${p.user_id}`} className="block text-center text-xs text-stone-400 underline">
            Open profile page · report or block
          </Link>
        </div>
      </div>

      {/* Swipe stamps */}
      {dx > 40 && (
        <span className="pointer-events-none absolute left-6 top-24 z-20 rotate-[-12deg] rounded-lg border-4 border-emerald-400 px-3 py-1 text-2xl font-extrabold text-emerald-400">
          INTERESTED
        </span>
      )}
      {dx < -40 && (
        <span className="pointer-events-none absolute right-6 top-24 z-20 rotate-[12deg] rounded-lg border-4 border-rose-500 px-3 py-1 text-2xl font-extrabold text-rose-500">
          SKIP
        </span>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto">{closeBtn}</div>
        <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          {index + 1} / {people.length}
        </span>
        <button
          onClick={back}
          disabled={index === 0 || pending}
          aria-label="Back to previous person"
          className="pointer-events-auto flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 text-xs font-semibold text-white backdrop-blur transition active:scale-95 disabled:opacity-0"
        >
          ↺ Back
        </button>
      </div>

      {msg && (
        <p className="absolute inset-x-0 top-16 z-30 mx-auto w-fit max-w-[90%] rounded-full bg-black/70 px-4 py-2 text-center text-sm text-white backdrop-blur">
          {msg}
        </p>
      )}

      {/* Action buttons stay on screen while you scroll */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center justify-center gap-5 bg-gradient-to-t from-black/50 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
        <button onClick={skip} disabled={pending} aria-label="Skip" className={`${roundBtn} pointer-events-auto h-14 w-14 bg-white text-rose-500`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {alreadySent ? (
          <button onClick={next} className={`${roundBtn} pointer-events-auto h-16 bg-white px-5 text-sm font-semibold text-teal-800`}>
            Sent ✓
          </button>
        ) : (
          <button onClick={yes} disabled={pending} aria-label="Interested" className={`${roundBtn} pointer-events-auto h-16 w-16 bg-teal-500 text-white ring-4 ring-white/40`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 9h12l-3-3M19 15H7l3 3" />
            </svg>
          </button>
        )}
        <button onClick={share} aria-label="Share profile" className={`${roundBtn} pointer-events-auto h-14 w-14 bg-white text-violet-500`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      {children}
    </section>
  );
}

function Skills({ skills, tone, showLevel = false }: { skills: Person["offers"]; tone: "teal" | "amber"; showLevel?: boolean }) {
  if (!skills?.length) return <p className="text-sm text-stone-400">None listed</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s, i) => (
        <Chip key={i} tone={tone}>
          {s.skill} · {s.category}
          {showLevel && LEVELS[s.level] ? ` · ${LEVELS[s.level]}` : ""}
        </Chip>
      ))}
    </div>
  );
}
