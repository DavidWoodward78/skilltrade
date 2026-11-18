import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Banner, Card, PageTitle, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PLAN_LABEL } from "@/lib/plans";
import { ownerSetPlan } from "./actions";

type Row = { id: string; name: string; slug: string; plan: string; billing_status: string; trial_ends_at: string; member_limit: number; members: number; created_at: string };

export default async function Owner({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data: isOwner } = await supabase.rpc("is_platform_admin");
  if (!isOwner) notFound();
  const { data } = await supabase.rpc("owner_orgs");
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PageTitle sub="Only you see this page. Give pilots free access or set custom limits.">All communities</PageTitle>
      <Banner error={sp.error} notice={sp.notice} />
      <div className="space-y-3">
        {rows.map((o) => (
          <Card key={o.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <a href={`/o/${o.slug}/admin`} className="font-semibold hover:underline">{o.name}</a>
                <p className="text-xs text-stone-500">
                  {PLAN_LABEL[o.plan] ?? o.plan} · {o.billing_status}
                  {o.plan === "trial" && ` · trial ends ${new Date(o.trial_ends_at).toLocaleDateString()}`} · {o.members}/{o.member_limit} members
                </p>
              </div>
            </div>
            <form action={ownerSetPlan} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="org_id" value={o.id} />
              <label className="text-xs">
                <span className="block text-stone-500">Plan</span>
                <select name="plan" defaultValue={o.plan} className={inputCls}>
                  {["trial", "pilot", "community", "growth", "enterprise"].map((p) => (
                    <option key={p} value={p}>{PLAN_LABEL[p]}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="block text-stone-500">Member limit</span>
                <input name="limit" type="number" min={1} defaultValue={o.member_limit} className={`${inputCls} w-28`} />
              </label>
              <SubmitButton variant="ghost" pendingText="Saving…">Save</SubmitButton>
            </form>
          </Card>
        ))}
      </div>
    </main>
  );
}
