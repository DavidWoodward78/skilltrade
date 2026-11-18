import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Banner, Card, Empty, PageTitle } from "@/components/ui";
import { Avatar } from "@/components/Avatar";

export default async function Matches({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, user, org } = await getOrgContext(slug);

  const { data: matches } = await supabase
    .from("matches")
    .select("id, user_a, user_b, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });
  const otherIds = (matches ?? []).map((m) => (m.user_a === user.id ? m.user_b : m.user_a));
  const [{ data: profiles }, { data: lastMsgs }, { data: incoming }] = await Promise.all([
    otherIds.length
      ? supabase.from("profiles").select("id, display_name, headline, avatar_url").in("id", otherIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string; headline: string; avatar_url: string }[] }),
    (matches ?? []).length
      ? supabase.from("messages").select("match_id, body, created_at").in("match_id", matches!.map((m) => m.id)).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as { match_id: string; body: string; created_at: string }[] }),
    supabase.from("interests").select("from_user").eq("org_id", org.id).eq("to_user", user.id),
  ]);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const last = new Map<string, string>();
  for (const m of lastMsgs ?? []) if (!last.has(m.match_id)) last.set(m.match_id, m.body);
  const matchedIds = new Set(otherIds);
  const waiting = (incoming ?? []).filter((i) => !matchedIds.has(i.from_user)).length;

  return (
    <>
      <PageTitle>Matches</PageTitle>
      <Banner error={sp.error} notice={sp.notice} />
      {waiting > 0 && (
        <p className="mb-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
          {waiting} {waiting === 1 ? "person is" : "people are"} interested in you.{" "}
          <Link href={`/o/${slug}?view=swipe`} className="font-medium underline">Find them in Discover</Link> to match.
        </p>
      )}
      {(matches ?? []).length === 0 ? (
        <Empty>No matches yet. When you and someone else are both interested, you&apos;ll match here.</Empty>
      ) : (
        <div className="space-y-2">
          {matches!.map((m) => {
            const other = byId.get(m.user_a === user.id ? m.user_b : m.user_a);
            return (
              <Link key={m.id} href={`/o/${slug}/matches/${m.id}`} className="block">
                <Card className="flex items-center gap-3 hover:border-teal-600">
                  <Avatar name={other?.display_name || "Member"} url={other?.avatar_url} size={48} />
                  <div className="min-w-0">
                    <p className="font-semibold">{other?.display_name || "Member"}</p>
                    <p className="truncate text-sm text-stone-500">{last.get(m.id) ?? other?.headline ?? "Say hi"}</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
