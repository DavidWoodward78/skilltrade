import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import type { Trade } from "@/lib/constants";
import { Banner, Card, Field, StatusBadge, inputCls } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { NewMemberWarning, type Rep } from "@/components/Reputation";
import { SubmitButton } from "@/components/SubmitButton";
import { proposeTrade } from "../../actions";
import { Chat } from "./Chat";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; matchId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug, matchId } = await params;
  const sp = await searchParams;
  const { supabase, user } = await getOrgContext(slug);

  const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (!match) notFound();
  const otherId = match.user_a === user.id ? match.user_b : match.user_a;
  await supabase.rpc("mark_match_read", { p_match: matchId });

  const [{ data: other }, { data: messages }, { data: trades }, { data: otherRep }] = await Promise.all([
    supabase.from("profiles").select("display_name, headline, avatar_url").eq("id", otherId).single(),
    supabase.from("messages").select("id, sender_id, body, created_at").eq("match_id", matchId).order("created_at").limit(500),
    supabase.from("trades").select("*").eq("match_id", matchId).order("created_at", { ascending: false }),
    supabase.rpc("reputation", { p_user: otherId }).maybeSingle<Rep>(),
  ]);
  const backPath = `/o/${slug}/matches/${matchId}`;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const name = other?.display_name || "them";

  return (
    <>
      <Link href={`/o/${slug}/people/${otherId}`} className="mb-4 flex items-center gap-3">
        <Avatar name={other?.display_name || "Match"} url={other?.avatar_url} size={52} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{other?.display_name || "Match"}</h1>
          <p className="truncate text-sm text-stone-500">{other?.headline || "View profile"}</p>
        </div>
      </Link>
      <Banner error={sp.error} notice={sp.notice} />

      {(trades as Trade[] | null)?.length ? (
        <div className="mb-4 space-y-2">
          {(trades as Trade[]).map((t) => (
            <Link key={t.id} href={`/o/${slug}/trades/${t.id}`} className="block">
              <Card className="flex items-center justify-between gap-2 hover:border-teal-600">
                <span className="truncate text-sm">
                  {t.proposer_id === user.id ? t.proposer_gives : t.partner_gives} ⇄{" "}
                  {t.proposer_id === user.id ? t.partner_gives : t.proposer_gives}
                </span>
                <StatusBadge status={t.status} />
              </Card>
            </Link>
          ))}
        </div>
      ) : null}

      <Chat matchId={matchId} me={user.id} otherName={name} otherAvatar={other?.avatar_url ?? ""} initial={messages ?? []} backPath={backPath} />

      <details className="mt-4 rounded-2xl border border-stone-200 bg-white p-4" open={!trades?.length}>
        <summary className="cursor-pointer font-medium">Propose a Trade Card</summary>
        <p className="mt-1 text-sm text-stone-500">Agree the details in chat first. The trade starts when {name} accepts.</p>
        <div className="mt-3"><NewMemberWarning name={name} rep={otherRep ?? null} /></div>
        <form action={proposeTrade} className="mt-3 space-y-3">
          <input type="hidden" name="match_id" value={matchId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="back" value={backPath} />
          <Field label="You deliver">
            <input name="i_give" required maxLength={300} placeholder="e.g. Responsive landing page, 1 revision" className={inputCls} />
          </Field>
          <Field label={`${name} delivers`}>
            <input name="they_give" required maxLength={300} placeholder="e.g. Launch plan + 10 outreach emails" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Your hours">
              <input name="my_hours" type="number" min="0.5" step="0.5" required className={inputCls} />
            </Field>
            <Field label="Their hours">
              <input name="their_hours" type="number" min="0.5" step="0.5" required className={inputCls} />
            </Field>
          </div>
          <Field label="Due date">
            <input name="due_date" type="date" min={tomorrow} required className={inputCls} />
          </Field>
          <Field label="Done means…" hint="How you'll both know each side delivered.">
            <textarea name="definition_of_done" required rows={2} maxLength={600} className={inputCls} />
          </Field>
          <SubmitButton pendingText="Sending…">Send Trade Card</SubmitButton>
        </form>
      </details>
    </>
  );
}
