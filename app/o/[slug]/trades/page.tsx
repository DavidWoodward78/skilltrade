import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import type { Trade } from "@/lib/constants";
import { Banner, Card, Empty, PageTitle, StatusBadge } from "@/components/ui";
import { Avatar } from "@/components/Avatar";

export default async function Trades({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, user, org } = await getOrgContext(slug);
  const { data } = await supabase
    .from("trades")
    .select("*")
    .eq("org_id", org.id)
    .or(`proposer_id.eq.${user.id},partner_id.eq.${user.id}`)
    .order("created_at", { ascending: false });
  const trades = (data ?? []) as Trade[];
  const otherIds = [...new Set(trades.map((t) => (t.proposer_id === user.id ? t.partner_id : t.proposer_id)))];
  const { data: profiles } = otherIds.length
    ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", otherIds)
    : { data: [] as { id: string; display_name: string; avatar_url: string }[] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const photos = new Map((profiles ?? []).map((p) => [p.id, p.avatar_url]));

  const needsMe = (t: Trade) =>
    (t.status === "proposed" && t.partner_id === user.id) ||
    (t.status === "active" &&
      ((t.proposer_id === user.id && !t.partner_delivery_confirmed_at) ||
        (t.partner_id === user.id && !t.proposer_delivery_confirmed_at)));

  const groups = [
    { title: "Open", items: trades.filter((t) => t.status === "proposed" || t.status === "active") },
    { title: "Closed", items: trades.filter((t) => !["proposed", "active"].includes(t.status)) },
  ];

  return (
    <>
      <PageTitle sub="Every trade has an agreed scope, a due date and a definition of done.">Your trades</PageTitle>
      <Banner error={sp.error} notice={sp.notice} />
      {trades.length === 0 ? (
        <Empty href={`/o/${slug}`} cta="Find someone to trade with">
          No trades yet. Match with someone, agree the details in chat, then send a Trade Card.
        </Empty>
      ) : (
        groups.map(
          (g) =>
            g.items.length > 0 && (
              <section key={g.title} className="mb-6">
                <h2 className="mb-2 text-sm font-medium text-stone-500">{g.title}</h2>
                <div className="space-y-2">
                  {g.items.map((t) => {
                    const mine = t.proposer_id === user.id;
                    return (
                      <Link key={t.id} href={`/o/${slug}/trades/${t.id}`} className="block">
                        <Card className="hover:border-teal-600">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 font-semibold">
                              <Avatar name={names.get(mine ? t.partner_id : t.proposer_id) || "Member"} url={photos.get(mine ? t.partner_id : t.proposer_id)} size={32} />
                              {names.get(mine ? t.partner_id : t.proposer_id) || "Member"}
                            </span>
                            <StatusBadge status={t.status} />
                          </div>
                          <p className="mt-1 truncate text-sm text-stone-600">
                            You: {mine ? t.proposer_gives : t.partner_gives}
                          </p>
                          <p className="truncate text-sm text-stone-600">
                            Them: {mine ? t.partner_gives : t.proposer_gives}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            Due {t.due_date}
                            {needsMe(t) && <span className="ml-2 font-medium text-amber-700">Needs your action</span>}
                          </p>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ),
        )
      )}
    </>
  );
}
