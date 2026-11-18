import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { Banner, Card, Field, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createOrg, joinOrg } from "./actions";

export default async function Orgs({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: rows } = await supabase
    .from("memberships")
    .select("role, organizations(name, slug)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const { data: pending } = await supabase.rpc("my_pending_requests");
  const { data: isOwner } = await supabase.rpc("is_platform_admin");
  const orgs = (rows ?? []).map((r) => {
    const o = r.organizations as unknown as { name: string; slug: string };
    return { ...o, role: r.role as string };
  });

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <form action="/auth/signout" method="post">
          <button className="text-sm text-stone-500 hover:text-stone-800">Sign out</button>
        </form>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Your communities</h1>
      <div className="mt-4">
        <Banner error={sp.error} notice={sp.notice} />
      </div>

      <div className="mt-2 space-y-2">
        {orgs.length === 0 && (
          <p className="text-sm text-stone-500">You&apos;re not in a community yet. Join with an invite, or start one.</p>
        )}
        {orgs.map((o) => (
          <Link key={o.slug} href={`/o/${o.slug}`} className="block">
            <Card className="flex items-center justify-between hover:border-teal-600">
              <span className="font-medium">{o.name}</span>
              {o.role === "admin" && <span className="text-xs text-teal-700">Admin</span>}
            </Card>
          </Link>
        ))}
      </div>

      {(pending ?? []).length > 0 && (
        <div className="mt-4 space-y-2">
          {(pending as { org_name: string }[]).map((p) => (
            <Card key={p.org_name} className="flex items-center justify-between border-dashed">
              <span className="font-medium text-stone-500">{p.org_name}</span>
              <span className="text-xs text-amber-700">Waiting for admin approval</span>
            </Card>
          ))}
        </div>
      )}

      {isOwner && (
        <a href="/owner" className="mt-4 block text-sm font-medium text-teal-700">Owner: manage all communities →</a>
      )}

      <Card className="mt-8">
        <h2 className="font-medium">Join with an invite</h2>
        <form action={joinOrg} className="mt-3 flex gap-2">
          <input name="code" required placeholder="Invite code or link" className={inputCls} />
          <SubmitButton pendingText="Joining…">Join</SubmitButton>
        </form>
      </Card>

      <Card className="mt-4">
        <h2 className="font-medium">Start a community</h2>
        <p className="mt-1 text-sm text-stone-500">For accelerators, bootcamps and founder groups. You&apos;ll be the admin. Free for 30 days, then plans start at $99/month.</p>
        <form action={createOrg} className="mt-3 space-y-3">
          <Field label="Community name">
            <input name="name" required minLength={2} maxLength={80} className={inputCls} />
          </Field>
          <SubmitButton pendingText="Creating…">Create community</SubmitButton>
        </form>
      </Card>
    </main>
  );
}
