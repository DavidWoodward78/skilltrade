import { siteUrl } from "@/lib/site";
import { getOrgContext } from "@/lib/org";
import { CATEGORIES, LEVELS } from "@/lib/constants";
import { Banner, Card, Chip, Field, PageTitle, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Reputation, type Rep } from "@/components/Reputation";
import { AvatarUpload } from "@/components/AvatarUpload";
import { ConnectAccounts } from "@/components/ConnectAccounts";
import { addSkill, leaveOrg, removeSkill, saveProfile, savePortfolio } from "../actions";

type SkillRow = { id: string; kind: "offer" | "need"; category: string; skill: string; level: number };

export default async function Profile({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, user, org } = await getOrgContext(slug);
  const backPath = `/o/${slug}/profile`;

  const [{ data: profile }, { data: skills }, { data: rep }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_skills").select("id, kind, category, skill, level").eq("user_id", user.id).order("created_at"),
    supabase.rpc("reputation", { p_user: user.id }).maybeSingle<Rep>(),
  ]);
  const rows = (skills ?? []) as SkillRow[];
  const origin = siteUrl();
  const suggested = (profile?.display_name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

  return (
    <>
      <PageTitle sub="Your profile and skills go with you to every community you join.">Your profile</PageTitle>
      <Banner error={sp.error} notice={sp.notice} />

      <Card className="mb-4">
        <AvatarUpload userId={user.id} name={profile?.display_name || "You"} url={profile?.avatar_url ?? ""} />
      </Card>

      <Card className="mb-4">
        <h2 className="font-medium">Verify your identity</h2>
        <p className="mb-3 mt-1 text-sm text-stone-500">
          Connect an account to get a verified badge. People are more likely to trade with you, and you rank higher in Discover.
        </p>
        <ConnectAccounts github={profile?.verified_github ?? null} linkedin={!!profile?.verified_linkedin} back={backPath} />
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 font-medium">Reputation</h2>
        <Reputation rep={rep ?? null} />
      </Card>

      {(["offer", "need"] as const).map((kind) => (
        <Card key={kind} className="mb-4">
          <h2 className="font-medium">{kind === "offer" ? "What you offer" : "What you need"}</h2>
          <ul className="mt-2 space-y-1">
            {rows.filter((r) => r.kind === kind).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {r.skill} <Chip>{r.category}</Chip>{" "}
                  {kind === "offer" && <span className="text-xs text-stone-500">{LEVELS[r.level]}</span>}
                </span>
                <form action={removeSkill}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="back" value={backPath} />
                  <button className="text-xs text-stone-500 hover:text-rose-700">Remove</button>
                </form>
              </li>
            ))}
            {rows.filter((r) => r.kind === kind).length === 0 && (
              <li className="text-sm text-stone-500">Nothing yet. Add up to 5.</li>
            )}
          </ul>
          <form action={addSkill} className="mt-3 grid grid-cols-2 gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="back" value={backPath} />
            <select name="category" required className={inputCls} defaultValue="">
              <option value="" disabled>Category</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {kind === "offer" ? (
              <select name="level" className={inputCls} defaultValue="2">
                {Object.entries(LEVELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="level" value="2" />
            )}
            <input
              name="skill"
              placeholder={kind === "offer" ? "e.g. React + Supabase" : "e.g. Launch plan"}
              maxLength={80}
              className={`${inputCls} col-span-2`}
            />
            <SubmitButton variant="ghost" className="col-span-2" pendingText="Adding…">
              Add
            </SubmitButton>
          </form>
        </Card>
      ))}

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Public portfolio</h2>
            <p className="mt-1 text-sm text-stone-500">
              A shareable page of your completed, verified trades. Put it on LinkedIn or your résumé.
            </p>
          </div>
          {profile?.portfolio_public && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Live</span>}
        </div>
        {profile?.portfolio_public && profile?.username && (
          <a href={`/p/${profile.username}`} target="_blank" className="mt-3 block truncate rounded-xl bg-stone-100 px-3 py-2 font-mono text-xs text-teal-800">
            {origin}/p/{profile.username}
          </a>
        )}
        <form action={savePortfolio} className="mt-3 space-y-3">
          <input type="hidden" name="back" value={backPath} />
          <Field label="Username" hint="3–30 lowercase letters, numbers or dashes.">
            <div className="flex items-center rounded-xl border border-stone-300 bg-white pl-3 focus-within:border-teal-600">
              <span className="text-sm text-stone-400">/p/</span>
              <input name="username" required defaultValue={profile?.username ?? suggested} pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]" className="w-full rounded-xl px-1 py-2 text-sm outline-none" />
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="portfolio_public" defaultChecked={profile?.portfolio_public} className="h-4 w-4 accent-teal-700" />
            Make my portfolio public
          </label>
          <p className="text-xs text-stone-500">
            Shows your photo, headline, track record, and completed trades with your proof links and partner reviews. Trade
            partners appear by name only if their portfolio is public too. You can hide any trade from its Trade Card.
          </p>
          <SubmitButton variant="ghost">Save portfolio settings</SubmitButton>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 font-medium">About you</h2>
        <form action={saveProfile} className="space-y-3">
          <input type="hidden" name="back" value={backPath} />
          <Field label="Name">
            <input name="display_name" defaultValue={profile?.display_name} maxLength={60} required className={inputCls} />
          </Field>
          <Field label="Headline" hint="One line, e.g. “Solo dev building a SaaS for landlords”">
            <input name="headline" defaultValue={profile?.headline} maxLength={120} className={inputCls} />
          </Field>
          <Field label="Portfolio or LinkedIn link" hint="People are more likely to trade with you when they can see your work.">
            <input name="portfolio_url" type="url" defaultValue={profile?.portfolio_url} className={inputCls} />
          </Field>
          <Field label="Availability" hint="e.g. “5 hrs/week, evenings ET”">
            <input name="availability" defaultValue={profile?.availability} maxLength={80} className={inputCls} />
          </Field>
          <Field label="Bio">
            <textarea name="bio" defaultValue={profile?.bio} maxLength={1000} rows={4} className={inputCls} />
          </Field>
          <SubmitButton>Save profile</SubmitButton>
        </form>
      </Card>

      <Card className="mb-4 flex items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">Password</p>
          <p className="text-stone-500">Set or change the password you sign in with.</p>
        </div>
        <a href="/reset-password" className="shrink-0 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold hover:bg-stone-50">
          Change password
        </a>
      </Card>

      <form action={leaveOrg} className="text-center">
        <input type="hidden" name="org_id" value={org.id} />
        <input type="hidden" name="back" value={backPath} />
        <button className="text-xs text-stone-400 hover:text-rose-700">Leave {org.name}</button>
      </form>
    </>
  );
}
