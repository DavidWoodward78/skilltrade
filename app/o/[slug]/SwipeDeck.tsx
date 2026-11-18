"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fitLabel, SkillRow, type Person } from "@/components/PersonCard";
import { PhotoPanel } from "@/components/Avatar";
import { Empty } from "@/components/ui";
import { VerifiedBadges } from "@/components/Verified";
import { swipeInterest } from "./actions";

export function SwipeDeck({ slug, orgId, people }: { slug: string; orgId: string; people: Person[] }) {
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startX = useRef<number | null>(null);
  const router = useRouter();
  const p = people[index];
  const nextP = people[index + 1];

  function next() {
    setDx(0);
    setIndex((i) => i + 1);
  }

  function yes() {
    if (!p) return;
    start(async () => {
      const res = await swipeInterestSafe(orgId, slug, p.user_id);
      if (res.error) return setMsg(res.error);
      if (res.matchId) return router.push(`/o/${slug}/matches/${res.matchId}?notice=${encodeURIComponent("It's a match!")}`);
      setMsg(`Interest sent to ${p.display_name || "them"}.`);
      next();
    });
  }

  function skip() {
    setMsg(null);
    next();
  }

  if (!p) {
    return <Empty>You&apos;ve seen everyone with a fit for now. Try search, or check back as people join.</Empty>;
  }

  const fit = fitLabel(p);
  return (
    <div>
      {msg && <p className="mb-2 text-center text-sm text-stone-600">{msg}</p>}
      <div className="relative">
        {nextP && (
          <div className="absolute inset-x-3 top-2 -z-0 scale-[0.97] opacity-60">
            <PhotoPanel name={nextP.display_name} url={nextP.avatar_url} />
          </div>
        )}
        <div
          className="relative touch-pan-y select-none transition-transform duration-75"
          style={{ transform: `translateX(${dx}px) rotate(${dx / 22}deg)` }}
          onPointerDown={(e) => (startX.current = e.clientX)}
          onPointerMove={(e) => startX.current !== null && setDx(e.clientX - startX.current)}
          onPointerUp={() => {
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
          <PhotoPanel name={p.display_name || "New member"} url={p.avatar_url}>
            {fit && (
              <span className="mb-2 inline-block rounded-full bg-teal-500 px-2.5 py-0.5 text-xs font-semibold text-white">{fit.text}</span>
            )}
            <Link href={`/o/${slug}/people/${p.user_id}`} className="block">
              <p className="flex items-center gap-2 text-2xl font-bold leading-tight">{p.display_name || "New member"} <VerifiedBadges github={p.verified_github} linkedin={p.verified_linkedin} dark /></p>
              {p.headline && <p className="text-sm text-white/85">{p.headline}</p>}
            </Link>
            <SkillRow label="Offers" skills={p.offers} tone="teal" dark />
            <SkillRow label="Needs" skills={p.needs} tone="amber" dark />
          </PhotoPanel>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-center gap-6">
        <button
          onClick={skip}
          disabled={pending}
          aria-label="Skip"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-stone-200 bg-white text-2xl text-stone-500 shadow-md transition active:scale-95"
        >
          ✕
        </button>
        <button
          onClick={yes}
          disabled={pending}
          aria-label="Interested"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/30 transition active:scale-95 disabled:opacity-60"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 9h12l-3-3M19 15H7l3 3" />
          </svg>
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-stone-400">
        {index + 1} of {people.length} · swipe right if you&apos;d trade, left to skip
      </p>
    </div>
  );
}

async function swipeInterestSafe(orgId: string, slug: string, to: string) {
  try {
    return await swipeInterest(orgId, slug, to);
  } catch {
    return { error: "Something went wrong. Try again." } as { error: string; matchId?: string };
  }
}
