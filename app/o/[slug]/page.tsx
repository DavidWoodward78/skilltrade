import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Banner, Empty, PageTitle, btnGhostCls, inputCls } from "@/components/ui";
import { PersonCard, type Person } from "@/components/PersonCard";
import { SubmitButton } from "@/components/SubmitButton";
import { expressInterest } from "./actions";
import { SwipeDeck } from "./SwipeDeck";

export default async function Discover({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; view?: string; error?: string; notice?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, user, org } = await getOrgContext(slug);
  const q = (sp.q ?? "").trim();
  const swipe = sp.view === "swipe";

  const [{ data: people }, { count: mySkills }, { data: me }] = await Promise.all([
    supabase.rpc("discover", { p_org: org.id, p_query: q || null }),
    supabase.from("user_skills").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("profiles").select("avatar_url, headline").eq("id", user.id).single(),
  ]);
  const steps = [
    { done: !!me?.avatar_url, label: "Add a photo so people know who they're trading with" },
    { done: !!mySkills, label: "List what you offer and what you need" },
    { done: !!me?.headline, label: "Write a one-line headline" },
  ];
  const list = (people ?? []) as Person[];
  const backPath = `/o/${slug}${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageTitle sub="Search for a skill, or browse people whose needs fit your offers.">Discover</PageTitle>
      <Banner error={sp.error} notice={sp.notice} />

      {steps.some((st) => !st.done) && (
        <Link href={`/o/${slug}/profile`} className="mb-5 block rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-4 text-white shadow-lg shadow-teal-900/20">
          <p className="text-sm font-semibold">Get matched faster</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {steps.map((st) => (
              <li key={st.label} className={`flex items-center gap-2 ${st.done ? "text-white/60 line-through" : ""}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${st.done ? "border-white/60 bg-white/20" : "border-white"}`}>
                  {st.done ? "✓" : ""}
                </span>
                {st.label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold text-teal-100">Finish your profile →</p>
        </Link>
      )}

      <form className="mb-3 flex gap-2" action={`/o/${slug}`}>
        <input name="q" defaultValue={q} placeholder="e.g. React, SEO, logo, pricing" className={inputCls} />
        <button className={btnGhostCls}>Search</button>
      </form>
      <div className="mb-4 inline-flex rounded-xl bg-stone-200/70 p-1 text-sm font-medium">
        <Link
          href={`/o/${slug}${q ? `?q=${encodeURIComponent(q)}` : ""}`}
          className={`rounded-lg px-3 py-1.5 ${swipe ? "text-stone-500" : "bg-white text-stone-900 shadow-sm"}`}
        >
          List
        </Link>
        <Link href={`/o/${slug}?view=swipe`} className={`rounded-lg px-3 py-1.5 ${swipe ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}>
          Swipe mutual fits
        </Link>
      </div>

      {swipe ? (
        <SwipeDeck
          slug={slug}
          orgId={org.id}
          people={list.filter((p) => !p.matched && !p.i_am_interested && p.fit_score > 0)}
        />
      ) : list.length === 0 ? (
        <Empty>
          {q ? `No one matches “${q}” yet.` : "No other members yet. Share the invite link to get people in."}
        </Empty>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <PersonCard key={p.user_id} p={p} slug={slug}>
              {p.matched ? (
                <Link href={`/o/${slug}/matches`} className="text-sm font-medium text-teal-700">
                  Matched · open chat
                </Link>
              ) : p.i_am_interested ? (
                <span className="text-sm text-stone-500">Interest sent</span>
              ) : (
                <form action={expressInterest}>
                  <input type="hidden" name="org_id" value={org.id} />
                  <input type="hidden" name="to_user" value={p.user_id} />
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="back" value={backPath} />
                  <SubmitButton pendingText="Sending…">I&apos;m interested</SubmitButton>
                </form>
              )}
            </PersonCard>
          ))}
        </div>
      )}
    </>
  );
}
