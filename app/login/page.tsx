import { Logo } from "@/components/Logo";
import { Banner, Field, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { GitHubIcon, LinkedInIcon } from "@/components/Verified";
import { sendMagicLink, signInWithProvider } from "./actions";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/orgs";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-stone-500">
        Signing in with LinkedIn or GitHub adds a verified badge to your profile.
      </p>
      <div className="mt-6">
        <Banner error={sp.error} notice={sp.sent ? "Check your email for the sign-in link." : undefined} />
        <div className="space-y-2">
          <form action={signInWithProvider}>
            <input type="hidden" name="provider" value="linkedin_oidc" />
            <input type="hidden" name="next" value={next} />
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0a66c2] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#09579f] active:scale-[0.98]">
              <LinkedInIcon size={18} /> Continue with LinkedIn
            </button>
          </form>
          <form action={signInWithProvider}>
            <input type="hidden" name="provider" value="github" />
            <input type="hidden" name="next" value={next} />
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.98]">
              <GitHubIcon size={18} /> Continue with GitHub
            </button>
          </form>
        </div>
        <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
          <span className="h-px flex-1 bg-stone-200" /> or use email <span className="h-px flex-1 bg-stone-200" />
        </div>
        <form action={sendMagicLink} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <SubmitButton variant="ghost" className="w-full" pendingText="Sending…">
            Email me a sign-in link
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
