import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Avatar } from "@/components/Avatar";
import { LogoMark } from "@/components/Logo";
import { NavLinks } from "./NavLinks";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase, user, org, isAdmin, active } = await getOrgContext(slug);
  const trialDays = Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000);
  const [{ data: me }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
    supabase.from("memberships").select("suspended_at").eq("org_id", org.id).eq("user_id", user.id).single(),
  ]);
  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200/80 bg-[#f7f6f3]/85 px-4 py-2.5 backdrop-blur">
        <Link href="/orgs" className="flex min-w-0 items-center gap-2">
          <LogoMark size={26} />
          <span className="truncate text-sm font-semibold">{org.name}</span>
        </Link>
        <Link href={`/o/${slug}/profile`} aria-label="Your profile">
          <Avatar name={me?.display_name || "You"} url={me?.avatar_url} size={32} />
        </Link>
      </header>
      {!active && (
        <div role="alert" className="mx-4 mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{org.name} is read-only</p>
          <p className="mt-0.5">
            {isAdmin ? (
              <>The plan has ended. Members can see their chats and trades but can&apos;t start new ones. <a href={`/o/${slug}/admin`} className="font-semibold underline">Choose a plan</a></>
            ) : (
              <>This community&apos;s plan has ended. You can still see your chats and trades. Ask an admin to renew it.</>
            )}
          </p>
        </div>
      )}
      {active && isAdmin && org.plan === "trial" && trialDays <= 7 && (
        <div className="mx-4 mt-4 rounded-2xl bg-teal-50 p-3 text-sm text-teal-900">
          Free trial: {Math.max(0, trialDays)} day{trialDays === 1 ? "" : "s"} left. <a href={`/o/${slug}/admin`} className="font-semibold underline">Choose a plan</a>
        </div>
      )}
      {membership?.suspended_at && (
        <div role="alert" className="mx-4 mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">
          <p className="font-semibold">Your account is paused in {org.name}</p>
          <p className="mt-0.5">Members reported a problem, so an admin is reviewing. You can still see your trades and chats, but you can&apos;t start new matches or trades until they&apos;re done.</p>
        </div>
      )}
      <main className="px-4 py-5">{children}</main>
      <NavLinks slug={slug} orgId={org.id} isAdmin={isAdmin} />
    </div>
  );
}
