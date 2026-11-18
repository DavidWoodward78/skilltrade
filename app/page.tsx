import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/orgs");

  return (
    <main className="min-h-dvh">
      <section className="relative overflow-hidden bg-gradient-to-b from-teal-900 via-teal-800 to-teal-700 px-6 pb-16 pt-6 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="mx-auto max-w-md">
          <Logo light />
          <h1 className="mt-10 text-4xl font-bold leading-[1.05] tracking-tight">
            Trade skills.
            <br />
            <span className="text-teal-200">Ship faster.</span>
          </h1>
          <p className="mt-4 text-base text-teal-50/90">
            Find someone in your community who has the skill you need and needs the skill you have. Agree on the work,
            deliver it, and build a reputation for following through.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex -space-x-1">
              {["Maya Chen", "Jordan Ellis", "Priya Raman", "Sam Ortiz"].map((n) => (
                <Avatar key={n} name={n} size={36} ring />
              ))}
            </div>
            <p className="text-sm text-teal-50/80">Builders trading work, not cash</p>
          </div>
          <Link
            href="/login"
            className="mt-8 flex w-full items-center justify-center rounded-2xl bg-white py-3.5 text-base font-semibold text-teal-900 shadow-lg transition active:scale-[0.98]"
          >
            Get started — it&apos;s free
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-8 max-w-md px-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">Trade Card</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Completed</span>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
            <div className="flex flex-col items-center text-center">
              <Avatar name="Dev Patel" size={44} />
              <p className="mt-2 font-semibold">Landing page</p>
              <p className="text-xs text-stone-500">10 hrs</p>
            </div>
            <span className="text-2xl text-teal-700">⇄</span>
            <div className="flex flex-col items-center text-center">
              <Avatar name="Maya Chen" size={44} />
              <p className="mt-2 font-semibold">Launch plan</p>
              <p className="text-xs text-stone-500">8 hrs</p>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-stone-500">Both sides confirmed delivery · ★★★★★</p>
        </div>

        <ol className="mt-8 space-y-4 pb-12">
          {[
            ["List what you offer and need", "Up to five skills each way, plus a photo and a one-line headline."],
            ["Match on mutual fit", "Search for a skill or swipe through people whose needs fit your offers."],
            ["Agree a Trade Card", "What each side delivers, the hours, the due date and what done means."],
            ["Deliver, confirm, review", "Milestones with proof. Your track record follows you."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{i + 1}</span>
              <div>
                <p className="font-semibold">{t}</p>
                <p className="text-sm text-stone-500">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
