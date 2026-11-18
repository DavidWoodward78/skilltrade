import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { LEVELS } from "@/lib/constants";
import { Banner, Card, Chip, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Reputation, type Rep } from "@/components/Reputation";
import { Avatar } from "@/components/Avatar";
import { GitHubIcon, LinkedInIcon } from "@/components/Verified";
import { blockUser, expressInterest, reportUser, withdrawInterest } from "../../actions";

export default async function Person({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const { supabase, user, org } = await getOrgContext(slug);
  if (id === user.id) {
    const { redirect } = await import("next/navigation");
    redirect(`/o/${slug}/profile`);
  }

  const { data: member } = await supabase.from("memberships").select("user_id").eq("org_id", org.id).eq("user_id", id).maybeSingle();
  if (!member) notFound();

  const [{ data: p }, { data: skills }, { data: rep }, { data: reviews }, { data: interest }, { data: match }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    supabase.from("user_skills").select("kind, category, skill, level").eq("user_id", id).order("created_at"),
    supabase.rpc("reputation", { p_user: id }).maybeSingle<Rep>(),
    supabase.from("reviews").select("rating, comment, created_at").eq("reviewee_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("interests").select("from_user").eq("org_id", org.id).eq("from_user", user.id).eq("to_user", id).maybeSingle(),
    supabase.from("matches").select("id").eq("org_id", org.id).eq("user_a", user.id < id ? user.id : id).eq("user_b", user.id < id ? id : user.id).maybeSingle(),
  ]);
  if (!p) notFound();
  const backPath = `/o/${slug}/people/${id}`;
  const hidden = (
    <>
      <input type="hidden" name="org_id" value={org.id} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="back" value={backPath} />
    </>
  );

  return (
    <>
      <div className="mb-5 flex flex-col items-center text-center">
        <Avatar name={p.display_name || "New member"} url={p.avatar_url} size={112} className="shadow-lg" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{p.display_name || "New member"}</h1>
        {p.headline && <p className="mt-0.5 text-sm text-stone-500">{p.headline}</p>}
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
        {!p.verified_linkedin && !p.verified_github && <p className="mt-2 text-xs text-stone-400">Identity not verified</p>}
        {p.availability && <p className="mt-1 text-xs text-stone-400">Available {p.availability}</p>}
      </div>
      <Banner error={sp.error} notice={sp.notice} />

      <div className="mb-4 flex justify-center">
        {match ? (
          <Link href={`/o/${slug}/matches/${match.id}`} className="font-medium text-teal-700">
            You&apos;re matched · open chat →
          </Link>
        ) : interest ? (
          <form action={withdrawInterest} className="flex items-center gap-3">
            {hidden}
            <input type="hidden" name="to_user" value={id} />
            <span className="text-sm text-stone-500">Interest sent</span>
            <button className="text-sm text-stone-500 underline">Withdraw</button>
          </form>
        ) : (
          <form action={expressInterest}>
            {hidden}
            <input type="hidden" name="to_user" value={id} />
            <SubmitButton pendingText="Sending…" className="px-8">I&apos;m interested</SubmitButton>
          </form>
        )}
      </div>

      <Card className="mb-4">
        <h2 className="mb-3 font-medium">Track record</h2>
        <Reputation rep={rep ?? null} />
      </Card>

      <Card className="mb-4 space-y-3">
        {(["offer", "need"] as const).map((k) => (
          <div key={k}>
            <h3 className="text-sm font-medium text-stone-500">{k === "offer" ? "Offers" : "Needs"}</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {(skills ?? []).filter((s) => s.kind === k).map((s, i) => (
                <Chip key={i} tone={k === "offer" ? "teal" : "amber"}>
                  {s.skill} · {s.category}
                  {k === "offer" ? ` · ${LEVELS[s.level]}` : ""}
                </Chip>
              ))}
              {!(skills ?? []).some((s) => s.kind === k) && <span className="text-sm text-stone-400">None listed</span>}
            </div>
          </div>
        ))}
        {p.portfolio_url && (
          <a href={p.portfolio_url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm text-teal-700 underline">
            {p.portfolio_url}
          </a>
        )}
        {p.bio && <p className="whitespace-pre-line text-sm text-stone-700">{p.bio}</p>}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Reviews</h2>
        {(reviews ?? []).length === 0 && <p className="text-sm text-stone-500">No reviews yet.</p>}
        <ul className="space-y-2">
          {(reviews ?? []).map((r, i) => (
            <li key={i} className="text-sm">
              <span className="text-amber-600">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>{" "}
              <span className="text-stone-700">{r.comment}</span>
            </li>
          ))}
        </ul>
      </Card>

      <details className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer text-stone-500">Report or block</summary>
        <form action={reportUser} className="mt-3 space-y-2">
          {hidden}
          <input type="hidden" name="reported_id" value={id} />
          <textarea name="reason" required minLength={3} rows={3} placeholder="What happened? Only community admins see this." className={inputCls} />
          <SubmitButton variant="ghost" pendingText="Sending…">Send private report</SubmitButton>
        </form>
        <form action={blockUser} className="mt-3">
          {hidden}
          <input type="hidden" name="blocked_id" value={id} />
          <SubmitButton variant="danger" pendingText="Blocking…">Block</SubmitButton>
        </form>
      </details>
    </>
  );
}
