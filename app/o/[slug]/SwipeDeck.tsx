"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fitLabel, SkillRow, type Person } from "@/components/PersonCard";
import { PhotoPanel } from "@/components/Avatar";
import { VerifiedBadges } from "@/components/Verified";
import { swipeInterest } from "./actions";
import { siteUrl } from "@/lib/site";

export function SwipeDeck({
  slug,
  orgId,
  people,
  hasSkills,
}: {
  slug: string;
  orgId: string;
  people: Person[];
  hasSkills: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [dx, setDx] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startX = useRef<number | null>(null);
  const router = useRouter();

  // People you already sent interest to this session drop out of the deck on reset.
  const deck = people;
  const p = deck[index];
  const nextP = deck[index + 1];
  const alreadySent = p ? sent.has(p.user_id) : false;

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

  function yes() {
    if (!p || alreadySent) return next();
    start(async () => {
      let res: { error?: string; matchId?: string };
      try {
        res = await swipeInterest(orgId, slug, p.user_id);
      } catch {
        res = { error: "Something went wrong. Try again." };
      }
      if (res.error) return setMsg(res.error);
      if (res.matchId) return router.push(`/o/${slug}/matches/${res.matchId}?notice=${encodeURIComponent("It's a match!")}`);
      setSent((s) => new Set(s).add(p.user_id));
      setMsg(`Interest sent to ${p.display_name || "them"}.`);
      next();
    });
  }

  async function share() {
    if (!p) return;
    const url = `${siteUrl()}/o/${slug}/people/${p.user_id}`;
    const text = `${p.display_name || "This member"} on SkillTrade${p.headline ? `: ${p.headline}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: p.display_name, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg("Profile link copied. Members of this community can open it.");
    } catch {
      // share sheet dismissed
    }
  }

  function skip() {
    setMsg(null);
    next();
  }

  // Nobody to show at all
  if (deck.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 p-8 text-center">
        {hasSkills ? (
          <>
            <p className="font-semibold">No mutual fits right now</p>
            <p className="mt-1 text-sm text-stone-500">Try the List view or search, or add more skills to widen your matches.</p>
          </>
        ) : (
          <>
            <p className="font-semibold">Add your skills to see who fits you</p>
            <p className="mt-1 text-sm text-stone-500">Swipe shows people who need what you offer, or offer what you need.</p>
          </>
        )}
        <Link href={`/o/${slug}/profile`} className="mt-4 inline-flex rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
          {hasSkills ? "Edit my skills" : "Add my skills"}
        </Link>
      </div>
    );
  }

  // End of the deck
  if (!p) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 p-8 text-center">
        <p className="font-semibold">You&apos;ve seen everyone for now</p>
        <p className="mt-1 text-sm text-stone-500">
          {sent.size > 0 ? `You sent interest to ${sent.size}. You'll match if they say yes too.` : "Go back over people you skipped, or check again as new members join."}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button onClick={back} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700">
            ← Back
          </button>
          <button onClick={reset} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
            Start over
          </button>
        </div>
      </div>
    );
  }

  const fit = fitLabel(p);
  const roundBtn = "flex items-center justify-center rounded-full shadow-lg transition active:scale-90 disabled:opacity-40";

  return (
    <div>
      {msg && <p className="mb-2 text-center text-sm text-stone-600">{msg}</p>}
      <div className="relative">
        {nextP && (
          <div className="absolute inset-x-3 top-2 scale-[0.97] opacity-60" aria-hidden="true">
            <PhotoPanel name={nextP.display_name} url={nextP.avatar_url} />
          </div>
        )}
        <div
          className="relative touch-pan-y select-none transition-transform duration-75"
          style={{ transform: `translateX(${dx}px) rotate(${dx / 22}deg)` }}
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
          {dx > 40 && (
            <span className="absolute left-5 top-5 z-10 rotate-[-12deg] rounded-lg border-2 border-emerald-400 px-2 py-1 text-lg font-extrabold text-emerald-400">
              INTERESTED
            </span>
          )}
          {dx < -40 && (
            <span className="absolute right-5 top-5 z-10 rotate-[12deg] rounded-lg border-2 border-white px-2 py-1 text-lg font-extrabold text-white">
              SKIP
            </span>
          )}

          {/* Counter + back, top of card */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
            <button
              onClick={back}
              disabled={index === 0 || pending}
              aria-label="Back to previous person"
              className="flex h-9 items-center gap-1 rounded-full bg-black/35 px-3 text-xs font-semibold text-white backdrop-blur transition active:scale-95 disabled:opacity-0"
            >
              ← Back
            </button>
            <span className="rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              {index + 1} / {deck.length}
            </span>
          </div>

          <PhotoPanel name={p.display_name || "New member"} url={p.avatar_url}>
            {fit && (
              <span className="mb-2 inline-block rounded-full bg-teal-500 px-2.5 py-0.5 text-xs font-semibold text-white">{fit.text}</span>
            )}
            <Link href={`/o/${slug}/people/${p.user_id}`} className="block">
              <p className="flex items-center gap-2 text-2xl font-bold leading-tight">
                {p.display_name || "New member"} <VerifiedBadges github={p.verified_github} linkedin={p.verified_linkedin} dark />
              </p>
              {p.headline && <p className="text-sm text-white/85">{p.headline}</p>}
            </Link>
            <SkillRow label="Offers" skills={p.offers} tone="teal" dark />
            <SkillRow label="Needs" skills={p.needs} tone="amber" dark />

            {/* Action buttons on the card */}
            <div className="mt-4 flex items-center justify-center gap-4">
              <Link
                href={`/o/${slug}/people/${p.user_id}`}
                aria-label="View full profile"
                className={`${roundBtn} h-12 w-12 bg-sky-500 text-white`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
              </Link>
              <button onClick={skip} disabled={pending} aria-label="Skip" className={`${roundBtn} h-14 w-14 bg-rose-500 text-white`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              {alreadySent ? (
                <button onClick={next} className={`${roundBtn} h-16 px-5 bg-white/90 text-sm font-semibold text-teal-800`}>
                  Sent ✓
                </button>
              ) : (
                <button
                  onClick={yes}
                  disabled={pending}
                  aria-label="Interested"
                  className={`${roundBtn} h-16 w-16 bg-teal-500 text-white ring-4 ring-white/30`}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 9h12l-3-3M19 15H7l3 3" />
                  </svg>
                </button>
              )}
              <button onClick={share} aria-label="Share profile" className={`${roundBtn} h-12 w-12 bg-violet-500 text-white`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
                </svg>
              </button>
            </div>
          </PhotoPanel>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-stone-400">Swipe right if you&apos;d trade, left to skip</p>
    </div>
  );
}
