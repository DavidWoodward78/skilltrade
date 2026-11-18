import { siteUrl } from "@/lib/site";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Banner, Card, PageTitle, inputCls, pct } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Avatar } from "@/components/Avatar";
import { InviteShare } from "@/components/InviteShare";
import { VerifiedBadges } from "@/components/Verified";
import { decideJoin, pauseMember, reinstateMember, removeMember, resolveReport, rotateInvite, saveAccess, setRole } from "../actions";
import { PLANS, PLAN_LABEL, billingConfigured, type PlanId } from "@/lib/plans";

type Stats = {
  members: number;
  members_with_skills: number;
  members_with_completed_trade: number;
  members_with_repeat_trade: number;
  matches: number;
  trades_proposed: number;
  trades_accepted: number;
  trades_active: number;
  trades_completed: number;
  trades_failed: number;
  avg_rating: number | null;
  open_reports: number;
  skills: { category: string; offered: number; needed: number; gap: number }[];
};

export default async function Admin({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, user, org, isAdmin, active } = await getOrgContext(slug);
  if (!isAdmin) notFound();

  const [{ data: stats }, { data: members }, { data: reports }, { data: flagData }] = await Promise.all([
    supabase.rpc("org_stats", { p_org: org.id }),
    supabase.from("memberships").select("user_id, role, joined_at, suspended_at").eq("org_id", org.id).order("joined_at"),
    supabase.from("reports").select("id, reporter_id, reported_id, trade_id, reason, created_at").eq("org_id", org.id).is("resolved_at", null).order("created_at", { ascending: false }),
    supabase.rpc("org_flags", { p_org: org.id }),
  ]);
  const { data: requests } = await supabase
    .from("join_requests")
    .select("user_id, created_at")
    .eq("org_id", org.id)
    .eq("status", "pending")
    .order("created_at");
  type Flag = { kind: "closed_pair" | "fast_trade" | "reported" | "paused"; users: string[]; detail: string; trade_id?: string };
  const flags = (flagData ?? []) as Flag[];
  const st = stats as Stats;
  const ids = [...new Set([
    ...(members ?? []).map((m) => m.user_id),
    ...(reports ?? []).flatMap((r) => [r.reporter_id, r.reported_id]),
    ...flags.flatMap((f) => f.users),
    ...(requests ?? []).map((r) => r.user_id),
  ])];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name, avatar_url, verified_github, verified_linkedin").in("id", ids)
    : { data: [] as { id: string; display_name: string; avatar_url: string; verified_github: string | null; verified_linkedin: boolean }[] };
  const name = (id: string) => profiles?.find((p) => p.id === id)?.display_name || "Member";

  const origin = siteUrl();
  const inviteUrl = `${origin}/join/${org.invite_code}`;
  const backPath = `/o/${slug}/admin`;
  const closedAccepted = st.trades_completed + st.trades_failed;

  const tiles = [
    { label: "Members", value: st.members },
    { label: "Completed a trade", value: `${st.members_with_completed_trade} · ${pct(st.members ? st.members_with_completed_trade / st.members : null)}` },
    { label: "Trade completion", value: pct(closedAccepted ? st.trades_completed / closedAccepted : null) },
    { label: "Repeat traders", value: st.members_with_repeat_trade },
  ];
  const funnel = [
    { label: "Profiles with skills", n: st.members_with_skills },
    { label: "Matches", n: st.matches },
    { label: "Trade Cards proposed", n: st.trades_proposed },
    { label: "Accepted", n: st.trades_accepted },
    { label: "Completed", n: st.trades_completed },
  ];
  const maxSkill = Math.max(1, ...st.skills.map((s) => Math.max(s.offered, s.needed)));

  return (
    <>
      <PageTitle sub="Collaboration outcomes for your community.">Admin</PageTitle>
      <Banner error={sp.error} notice={sp.notice} />

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Plan and billing</h2>
            <p className="mt-1 text-sm text-stone-600">
              <b>{PLAN_LABEL[org.plan] ?? org.plan}</b>
              {org.plan === "trial" && (
                <> · {Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))} days left</>
              )}
              {org.billing_status === "past_due" && <span className="text-amber-700"> · payment failed, update your card</span>}
              {org.billing_status === "canceled" && <span className="text-rose-700"> · canceled</span>}
            </p>
            <p className="text-xs text-stone-500">
              {(members ?? []).length} of {org.member_limit >= 100000 ? "unlimited" : org.member_limit} members
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
            {active ? "Active" : "Read-only"}
          </span>
        </div>
        {org.plan !== "pilot" && (
          billingConfigured() ? (
            <>
              <div className="mt-3 grid gap-2">
                {(Object.keys(PLANS) as PlanId[]).map((id) => {
                  const p = PLANS[id];
                  const current = org.plan === id && org.billing_status === "active";
                  return (
                    <form key={id} action="/api/billing/checkout" method="post"
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${current ? "border-teal-600 bg-teal-50/50" : "border-stone-200"}`}>
                      <input type="hidden" name="org_id" value={org.id} />
                      <input type="hidden" name="plan" value={id} />
                      <div className="text-sm">
                        <p className="font-semibold">{p.name} <span className="font-normal text-stone-500">· {p.price}</span></p>
                        <p className="text-xs text-stone-500">{p.members >= 100000 ? "Unlimited members" : `Up to ${p.members} members`} · {p.blurb}</p>
                      </div>
                      {current ? (
                        <span className="text-xs font-semibold text-teal-700">Current</span>
                      ) : (
                        <button className="shrink-0 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Choose</button>
                      )}
                    </form>
                  );
                })}
              </div>
              {org.stripe_customer_id && (
                <form action="/api/billing/portal" method="post" className="mt-3">
                  <input type="hidden" name="org_id" value={org.id} />
                  <button className="text-sm font-medium text-teal-700 underline">Manage billing, invoices and cancellation</button>
                </form>
              )}
            </>
          ) : (
            <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">Paid plans are coming soon. Your community is free during the trial.</p>
          )
        )}
      </Card>

      {(requests ?? []).length > 0 && (
        <Card className="mb-4 border-amber-200">
          <h2 className="font-medium">Join requests <span className="text-amber-700">({(requests ?? []).length})</span></h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {(requests ?? []).map((r) => (
              <li key={r.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={name(r.user_id)} url={profiles?.find((p) => p.id === r.user_id)?.avatar_url} size={28} />
                  <span className="truncate">{name(r.user_id)}</span>
                  <VerifiedBadges github={profiles?.find((p) => p.id === r.user_id)?.verified_github} linkedin={profiles?.find((p) => p.id === r.user_id)?.verified_linkedin} />
                </span>
                <span className="flex shrink-0 gap-2">
                  <form action={decideJoin}>
                    <input type="hidden" name="org_id" value={org.id} />
                    <input type="hidden" name="user_id" value={r.user_id} />
                    <input type="hidden" name="approve" value="1" />
                    <input type="hidden" name="back" value={backPath} />
                    <SubmitButton pendingText="…">Approve</SubmitButton>
                  </form>
                  <form action={decideJoin}>
                    <input type="hidden" name="org_id" value={org.id} />
                    <input type="hidden" name="user_id" value={r.user_id} />
                    <input type="hidden" name="approve" value="0" />
                    <input type="hidden" name="back" value={backPath} />
                    <SubmitButton variant="ghost" pendingText="…">Decline</SubmitButton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4">
        <h2 className="font-medium">Who can join</h2>
        <form action={saveAccess} className="mt-3 space-y-3">
          <input type="hidden" name="org_id" value={org.id} />
          <input type="hidden" name="back" value={backPath} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="require_approval" defaultChecked={org.require_approval} className="mt-0.5 h-4 w-4 accent-teal-700" />
            <span>
              <span className="font-medium">Approve new members</span>
              <span className="block text-xs text-stone-500">The invite link sends you a request instead of letting people straight in.</span>
            </span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Only allow emails from this domain (optional)</span>
            <div className="flex items-center rounded-xl border border-stone-300 bg-white pl-3">
              <span className="text-stone-400">@</span>
              <input name="allowed_email_domain" defaultValue={org.allowed_email_domain ?? ""} placeholder="yourschool.edu" className="w-full rounded-xl px-1 py-2 outline-none" />
            </div>
          </label>
          <SubmitButton variant="ghost">Save</SubmitButton>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">Invite members</h2>
        <input readOnly value={inviteUrl} className={`${inputCls} mt-2 font-mono text-xs`} />
        <InviteShare url={inviteUrl} orgName={org.name} />
        <p className="mt-2 text-xs text-stone-500">Anyone with this link can join. Code: {org.invite_code}</p>
        <form action={rotateInvite} className="mt-2">
          <input type="hidden" name="org_id" value={org.id} />
          <input type="hidden" name="back" value={backPath} />
          <button className="text-xs text-stone-500 underline">Create a new link (old one stops working)</button>
        </form>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <Card key={t.label} className="p-3">
            <p className="text-lg font-semibold">{t.value}</p>
            <p className="text-xs text-stone-500">{t.label}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <h2 className="mb-3 font-medium">Trade funnel</h2>
        <ul className="space-y-2">
          {funnel.map((f) => (
            <li key={f.label} className="text-sm">
              <div className="flex justify-between">
                <span>{f.label}</span>
                <span className="font-medium tabular-nums">{f.n}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-stone-100">
                <div
                  className="h-2 rounded-full bg-teal-600"
                  style={{ width: `${Math.round((f.n / Math.max(1, funnel[0].n, ...funnel.map((x) => x.n))) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-500">
          {st.trades_active} active · {st.trades_failed} cancelled or incomplete after acceptance
          {st.avg_rating ? ` · average rating ${st.avg_rating}★` : ""}
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">Skill gaps</h2>
        <p className="mt-1 text-xs text-stone-500">How many members need each skill vs. offer it. Large gaps show where members need outside help.</p>
        <div className="mt-3 flex gap-4 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-amber-500" /> Needed</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-teal-600" /> Offered</span>
        </div>
        <ul className="mt-2 space-y-3">
          {st.skills.length === 0 && <li className="text-sm text-stone-500">No skills listed yet.</li>}
          {st.skills.map((s) => (
            <li key={s.category} className="text-sm">
              <div className="flex justify-between">
                <span>{s.category}</span>
                <span className={`text-xs ${s.gap > 0 ? "font-medium text-amber-700" : "text-stone-500"}`}>
                  {s.gap > 0 ? `short by ${s.gap}` : s.gap < 0 ? `${-s.gap} spare` : "balanced"}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(s.needed / maxSkill) * 100}%` }} />
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-stone-100">
                <div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${(s.offered / maxSkill) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">Needs a look {flags.length > 0 && <span className="text-amber-700">({flags.length})</span>}</h2>
        <p className="mt-1 text-xs text-stone-500">
          Patterns that can mean fake accounts boosting each other, or members who aren&apos;t delivering. Not proof on their own.
        </p>
        {flags.length === 0 && <p className="mt-2 text-sm text-stone-500">Nothing unusual right now.</p>}
        <ul className="mt-2 space-y-2">
          {flags.map((f, i) => {
            const label = { closed_pair: "Only trade with each other", fast_trade: "Trade finished suspiciously fast", reported: "Reported", paused: "Paused" }[f.kind];
            const tone = f.kind === "paused" || f.kind === "reported" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800";
            return (
              <li key={i} className="rounded-xl border border-stone-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
                  {f.trade_id && <a href={`/o/${slug}/trades/${f.trade_id}`} className="text-xs text-teal-700 underline">View trade</a>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {f.users.map((u) => (
                    <a key={u} href={`/o/${slug}/people/${u}`} className="flex items-center gap-1.5 font-medium">
                      <Avatar name={name(u)} url={profiles?.find((p) => p.id === u)?.avatar_url} size={24} />
                      {name(u)}
                    </a>
                  ))}
                </div>
                <p className="mt-1 text-xs text-stone-500">{f.detail}</p>
                {f.kind === "paused" && (
                  <form action={reinstateMember} className="mt-2">
                    <input type="hidden" name="org_id" value={org.id} />
                    <input type="hidden" name="user_id" value={f.users[0]} />
                    <input type="hidden" name="back" value={backPath} />
                    <SubmitButton variant="ghost" pendingText="Saving…">Reinstate</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">Reports {st.open_reports > 0 && <span className="text-rose-700">({st.open_reports} open)</span>}</h2>
        {(reports ?? []).length === 0 && <p className="mt-2 text-sm text-stone-500">No open reports.</p>}
        <ul className="mt-2 space-y-3">
          {(reports ?? []).map((r) => (
            <li key={r.id} className="rounded-xl border border-stone-200 p-3 text-sm">
              <p className="text-xs text-stone-500">
                {name(r.reporter_id)} reported {name(r.reported_id)} · {new Date(r.created_at).toLocaleDateString()}
                {r.trade_id && (
                  <>
                    {" · "}
                    <a href={`/o/${slug}/trades/${r.trade_id}`} className="underline">trade</a>
                  </>
                )}
              </p>
              <p className="mt-1 whitespace-pre-line">{r.reason}</p>
              <form action={resolveReport} className="mt-2">
                <input type="hidden" name="report_id" value={r.id} />
                <input type="hidden" name="back" value={backPath} />
                <SubmitButton variant="ghost" pendingText="Saving…">Mark resolved</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-medium">Members ({(members ?? []).length})</h2>
        <ul className="mt-2 divide-y divide-stone-100">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <a href={m.user_id === user.id ? `/o/${slug}/profile` : `/o/${slug}/people/${m.user_id}`} className="flex min-w-0 items-center gap-2 truncate">
                <Avatar name={name(m.user_id)} url={profiles?.find((p) => p.id === m.user_id)?.avatar_url} size={28} />
                {name(m.user_id)} {m.role === "admin" && <span className="text-xs text-teal-700">Admin</span>}
                <VerifiedBadges github={profiles?.find((p) => p.id === m.user_id)?.verified_github} linkedin={profiles?.find((p) => p.id === m.user_id)?.verified_linkedin} />
                {m.suspended_at && <span className="text-xs text-rose-700">Paused</span>}
              </a>
              {m.user_id !== user.id && (
                <div className="flex shrink-0 gap-3">
                  <form action={setRole}>
                    <input type="hidden" name="org_id" value={org.id} />
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                    <input type="hidden" name="back" value={backPath} />
                    <button className="text-xs text-stone-500 underline">{m.role === "admin" ? "Make member" : "Make admin"}</button>
                  </form>
                  {!m.suspended_at && m.role !== "admin" && (
                    <form action={pauseMember}>
                      <input type="hidden" name="org_id" value={org.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="back" value={backPath} />
                      <button className="text-xs text-stone-500 underline">Pause</button>
                    </form>
                  )}
                  <form action={removeMember}>
                    <input type="hidden" name="org_id" value={org.id} />
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <input type="hidden" name="back" value={backPath} />
                    <button className="text-xs text-rose-700 underline">Remove</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
