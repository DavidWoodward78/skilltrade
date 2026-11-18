import Link from "next/link";
import type { Skill } from "@/lib/constants";
import { Avatar } from "./Avatar";
import { VerifiedBadges } from "./Verified";
import { Card, Chip } from "./ui";

export type Person = {
  user_id: string;
  display_name: string;
  headline: string;
  availability: string;
  avatar_url: string;
  verified_github: string | null;
  verified_linkedin: boolean;
  offers: Skill[];
  needs: Skill[];
  fit_score: number;
  they_offer_what_i_need: number;
  they_need_what_i_offer: number;
  i_am_interested: boolean;
  matched: boolean;
};

export function fitLabel(p: Person) {
  if (p.they_offer_what_i_need > 0 && p.they_need_what_i_offer > 0) return { text: "Mutual fit", tone: "teal" as const };
  if (p.they_offer_what_i_need > 0) return { text: "Has what you need", tone: "amber" as const };
  if (p.they_need_what_i_offer > 0) return { text: "Needs what you offer", tone: "amber" as const };
  return null;
}

export function PersonCard({ p, slug, children }: { p: Person; slug: string; children?: React.ReactNode }) {
  const fit = fitLabel(p);
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Link href={`/o/${slug}/people/${p.user_id}`}>
          <Avatar name={p.display_name || "New member"} url={p.avatar_url} size={56} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/o/${slug}/people/${p.user_id}`} className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold"><span className="truncate">{p.display_name || "New member"}</span> <VerifiedBadges github={p.verified_github} linkedin={p.verified_linkedin} /></p>
              {p.headline && <p className="line-clamp-2 text-sm text-stone-500">{p.headline}</p>}
            </Link>
            {fit && <Chip tone={fit.tone}>{fit.text}</Chip>}
          </div>
        </div>
      </div>
      <SkillRow label="Offers" skills={p.offers} tone="teal" />
      <SkillRow label="Needs" skills={p.needs} tone="amber" />
      {p.availability && <p className="mt-2 text-xs text-stone-500">Available: {p.availability}</p>}
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}

export function SkillRow({ label, skills, tone, dark = false }: { label: string; skills: Skill[]; tone: "teal" | "amber"; dark?: boolean }) {
  if (!skills.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <span className={`mr-1 text-xs font-medium ${dark ? "text-white/70" : "text-stone-500"}`}>{label}</span>
      {skills.map((s, i) =>
        dark ? (
          <span key={i} className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white backdrop-blur">
            {s.skill === s.category ? s.category : s.skill}
          </span>
        ) : (
          <Chip key={i} tone={tone}>
            {s.skill === s.category ? s.category : `${s.skill} · ${s.category}`}
          </Chip>
        ),
      )}
    </div>
  );
}
