import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import type { Trade } from "@/lib/constants";
import { Banner, Card, Field, StatusBadge, inputCls } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { NewMemberWarning, type Rep } from "@/components/Reputation";
import { SubmitButton } from "@/components/SubmitButton";
import {
  addMilestone,
  cancelTrade,
  confirmDelivery,
  confirmMilestone,
  leaveReview,
  setShowcase,
  reportUser,
  respondTrade,
  submitMilestone,
} from "../../actions";

type Milestone = {
  id: string;
  owner_id: string;
  title: string;
  due_date: string | null;
  proof_url: string | null;
  proof_note: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
};

export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const { supabase, user, org } = await getOrgContext(slug);

  const { data: t } = await supabase.from("trades").select("*").eq("id", id).maybeSingle<Trade>();
  if (!t) notFound();
  const iAmIn = user.id === t.proposer_id || user.id === t.partner_id;
  const mine = t.proposer_id === user.id;
  const otherId = mine ? t.partner_id : t.proposer_id;

  const [{ data: profiles }, { data: milestones }, { data: myReview }, { data: otherRep }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url").in("id", [t.proposer_id, t.partner_id]),
    supabase.from("milestones").select("*").eq("trade_id", id).order("created_at"),
    supabase.from("reviews").select("rating").eq("trade_id", id).eq("reviewer_id", user.id).maybeSingle(),
    supabase.rpc("reputation", { p_user: otherId }).maybeSingle<Rep>(),
  ]);
  const name = (uid: string) => (uid === user.id ? "You" : profiles?.find((p) => p.id === uid)?.display_name || "Member");
  const other = name(otherId);
  const backPath = `/o/${slug}/trades/${id}`;
  const hidden = (
    <>
      <input type="hidden" name="trade_id" value={id} />
      <input type="hidden" name="back" value={backPath} />
    </>
  );

  const myDeliveryConfirmed = mine ? t.proposer_delivery_confirmed_at : t.partner_delivery_confirmed_at;
  const theirDeliveryConfirmed = mine ? t.partner_delivery_confirmed_at : t.proposer_delivery_confirmed_at;
  const open = t.status === "proposed" || t.status === "active";
  const overdue = t.status === "active" && t.due_date < new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex -space-x-3">
          {[t.proposer_id, t.partner_id].map((uid) => {
            const pr = profiles?.find((x) => x.id === uid);
            return <Avatar key={uid} name={pr?.display_name || "Member"} url={pr?.avatar_url} size={44} ring />;
          })}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">
            Trade with {mine || !iAmIn ? name(t.partner_id) : name(t.proposer_id)}
          </h1>
          <Link href={`/o/${slug}/matches/${t.match_id}`} className="text-sm text-teal-700">Open chat →</Link>
        </div>
      </div>
      <Banner error={sp.error} notice={sp.notice} />

      {iAmIn && open && <NewMemberWarning name={other} rep={otherRep ?? null} />}

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-stone-500">Trade Card</span>
          <StatusBadge status={t.status} />
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-stone-500">{name(t.proposer_id)} deliver{t.proposer_id === user.id ? "" : "s"} · {t.proposer_hours} hrs</dt>
            <dd className="font-medium">{t.proposer_gives}</dd>
          </div>
          <div>
            <dt className="text-stone-500">{name(t.partner_id)} deliver{t.partner_id === user.id ? "" : "s"} · {t.partner_hours} hrs</dt>
            <dd className="font-medium">{t.partner_gives}</dd>
          </div>
          <div className="flex gap-6">
            <div>
              <dt className="text-stone-500">Due</dt>
              <dd className={overdue ? "font-medium text-rose-700" : ""}>{t.due_date}{overdue ? " · overdue" : ""}</dd>
            </div>
          </div>
          <div>
            <dt className="text-stone-500">Done means</dt>
            <dd className="whitespace-pre-line">{t.definition_of_done}</dd>
          </div>
          {t.status === "cancelled" && t.cancel_reason && (
            <div>
              <dt className="text-stone-500">Cancelled by {name(t.cancelled_by ?? "")}</dt>
              <dd>{t.cancel_reason}</dd>
            </div>
          )}
        </dl>
        {Number(t.proposer_hours) / Number(t.partner_hours) > 2.5 || Number(t.partner_hours) / Number(t.proposer_hours) > 2.5 ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            Hours are uneven on this trade. Make sure you both agree it&apos;s fair before starting.
          </p>
        ) : null}
      </Card>

      {iAmIn && t.status === "proposed" && (
        <Card className="mb-4">
          {t.partner_id === user.id ? (
            <div className="flex gap-2">
              <form action={respondTrade} className="flex-1">
                {hidden}
                <input type="hidden" name="accept" value="1" />
                <SubmitButton className="w-full" pendingText="Accepting…">Accept trade</SubmitButton>
              </form>
              <form action={respondTrade} className="flex-1">
                {hidden}
                <input type="hidden" name="accept" value="0" />
                <SubmitButton variant="ghost" className="w-full" pendingText="Declining…">Decline</SubmitButton>
              </form>
            </div>
          ) : (
            <p className="text-sm text-stone-600">Waiting for {other} to accept.</p>
          )}
        </Card>
      )}

      {iAmIn && (t.status === "active" || (milestones ?? []).length > 0) && (
        <Card className="mb-4">
          <h2 className="font-medium">Milestones</h2>
          <p className="mt-1 text-xs text-stone-500">Break bigger work into check-ins. Attach a link or note as proof when you deliver.</p>
          <ul className="mt-3 space-y-3">
            {((milestones ?? []) as Milestone[]).map((m) => (
              <li key={m.id} className="rounded-xl border border-stone-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-stone-500">
                      {name(m.owner_id)} · {m.due_date ? `due ${m.due_date}` : "no date"}
                    </p>
                  </div>
                  <span className="text-xs">
                    {m.confirmed_at ? "✅ Confirmed" : m.submitted_at ? "Delivered" : "To do"}
                  </span>
                </div>
                {m.submitted_at && (
                  <div className="mt-2 text-xs text-stone-600">
                    {m.proof_url && (
                      <a href={m.proof_url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-teal-700 underline">
                        {m.proof_url}
                      </a>
                    )}
                    {m.proof_note && <p className="whitespace-pre-line">{m.proof_note}</p>}
                  </div>
                )}
                {t.status === "active" && m.owner_id === user.id && !m.confirmed_at && (
                  <form action={submitMilestone} className="mt-2 space-y-2">
                    {hidden}
                    <input type="hidden" name="milestone_id" value={m.id} />
                    <input name="proof_url" type="url" placeholder="Link to the work" className={inputCls} />
                    <input name="proof_note" placeholder="Or a short note" maxLength={500} className={inputCls} />
                    <SubmitButton variant="ghost" pendingText="Submitting…">
                      {m.submitted_at ? "Update proof" : "Mark delivered"}
                    </SubmitButton>
                  </form>
                )}
                {t.status === "active" && m.owner_id !== user.id && m.submitted_at && !m.confirmed_at && (
                  <form action={confirmMilestone} className="mt-2">
                    {hidden}
                    <input type="hidden" name="milestone_id" value={m.id} />
                    <SubmitButton variant="ghost" pendingText="Confirming…">Confirm received</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {t.status === "active" && (
            <form action={addMilestone} className="mt-3 grid grid-cols-2 gap-2">
              {hidden}
              <input name="title" required maxLength={200} placeholder="Milestone, e.g. First draft" className={`${inputCls} col-span-2`} />
              <select name="owner_id" className={inputCls} defaultValue={user.id}>
                <option value={user.id}>I deliver</option>
                <option value={otherId}>{other} delivers</option>
              </select>
              <input name="due_date" type="date" max={t.due_date} className={inputCls} />
              <SubmitButton variant="ghost" className="col-span-2" pendingText="Adding…">Add milestone</SubmitButton>
            </form>
          )}
        </Card>
      )}

      {iAmIn && t.status === "active" && (
        <Card className="mb-4 space-y-3">
          <h2 className="font-medium">Wrap up</h2>
          <p className="text-sm text-stone-600">
            Your delivery: {myDeliveryConfirmed ? "✅ confirmed by " + other : `waiting for ${other} to confirm`}
          </p>
          {theirDeliveryConfirmed ? (
            <p className="text-sm text-stone-600">✅ You confirmed {other} delivered.</p>
          ) : (
            <form action={confirmDelivery}>
              {hidden}
              <SubmitButton pendingText="Confirming…">Confirm {other} delivered</SubmitButton>
            </form>
          )}
          <p className="text-xs text-stone-500">
            The trade completes when both sides confirm. Trades left unconfirmed 14 days after the due date count as incomplete.
          </p>
        </Card>
      )}

      {iAmIn && ["completed", "incomplete", "cancelled"].includes(t.status) && !myReview && (
        <Card className="mb-4">
          <h2 className="font-medium">Review {other}</h2>
          <form action={leaveReview} className="mt-3 space-y-3">
            {hidden}
            <div className="flex gap-3 text-sm">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1">
                  <input type="radio" name="rating" value={n} required defaultChecked={n === 5} /> {n}★
                </label>
              ))}
            </div>
            <input name="comment" maxLength={280} placeholder="One line on how it went" className={inputCls} />
            <SubmitButton pendingText="Saving…">Leave review</SubmitButton>
          </form>
        </Card>
      )}

      {iAmIn && t.status === "completed" && (
        <Card className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">Public portfolio</p>
            <p className="text-stone-500">
              {(mine ? t.proposer_showcase : t.partner_showcase)
                ? "This trade shows on your portfolio (if it's public)."
                : "Hidden from your portfolio."}
            </p>
          </div>
          <form action={setShowcase}>
            {hidden}
            <input type="hidden" name="show" value={(mine ? t.proposer_showcase : t.partner_showcase) ? "0" : "1"} />
            <SubmitButton variant="ghost" pendingText="Saving…">
              {(mine ? t.proposer_showcase : t.partner_showcase) ? "Hide" : "Show"}
            </SubmitButton>
          </form>
        </Card>
      )}

      {iAmIn && open && (
        <details className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer text-stone-500">Cancel this trade</summary>
          <form action={cancelTrade} className="mt-3 space-y-2">
            {hidden}
            <Field label="Reason" hint="Shown on the trade and counted on your profile.">
              <input name="reason" required minLength={3} maxLength={300} className={inputCls} />
            </Field>
            <SubmitButton variant="danger" pendingText="Cancelling…">Cancel trade</SubmitButton>
          </form>
        </details>
      )}

      {iAmIn && (
        <details className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer text-stone-500">Problem with this trade?</summary>
          <form action={reportUser} className="mt-3 space-y-2">
            {hidden}
            <input type="hidden" name="org_id" value={org.id} />
            <input type="hidden" name="reported_id" value={otherId} />
            <textarea name="reason" required minLength={3} rows={3} placeholder="What happened? Only community admins see this." className={inputCls} />
            <SubmitButton variant="ghost" pendingText="Sending…">Send private report</SubmitButton>
          </form>
        </details>
      )}
    </>
  );
}
