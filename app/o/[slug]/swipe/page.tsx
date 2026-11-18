import { getOrgContext } from "@/lib/org";
import type { Person } from "@/components/PersonCard";
import type { Rep } from "@/components/Reputation";
import { FullDeck, type DeckPerson } from "./FullDeck";

export const metadata = { title: "Swipe" };

export default async function SwipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user, org } = await getOrgContext(slug);

  const [{ data: people }, { count: mySkills }] = await Promise.all([
    supabase.rpc("discover", { p_org: org.id, p_query: null }),
    supabase.from("user_skills").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const deck = ((people ?? []) as Person[]).filter((p) => !p.matched && !p.i_am_interested && p.fit_score > 0);
  const ids = deck.map((p) => p.user_id);

  // Everything the full profile shows, fetched once for the whole deck
  const [{ data: profiles }, { data: reviews }, reps] = await Promise.all([
    ids.length
      ? supabase.from("profiles").select("id, bio, portfolio_url").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; bio: string; portfolio_url: string }[] }),
    ids.length
      ? supabase.from("reviews").select("reviewee_id, rating, comment, created_at").in("reviewee_id", ids).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as { reviewee_id: string; rating: number; comment: string; created_at: string }[] }),
    Promise.all(ids.map((id) => supabase.rpc("reputation", { p_user: id }).maybeSingle<Rep>().then((r) => [id, r.data] as const))),
  ]);

  const repById = new Map(reps);
  const full: DeckPerson[] = deck.map((p) => {
    const extra = profiles?.find((x) => x.id === p.user_id);
    return {
      ...p,
      bio: extra?.bio ?? "",
      portfolio_url: extra?.portfolio_url ?? "",
      rep: repById.get(p.user_id) ?? null,
      reviews: (reviews ?? []).filter((r) => r.reviewee_id === p.user_id).slice(0, 3).map(({ rating, comment }) => ({ rating, comment })),
    };
  });

  return <FullDeck slug={slug} orgId={org.id} people={full} hasSkills={!!mySkills} />;
}
