import Link from "next/link";
import { AuthShell, PasswordField } from "@/components/AuthShell";
import { Divider, OAuthButtons } from "@/components/OAuthButtons";
import { Banner, Field, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { sendMagicLink, signInWithPassword } from "./actions";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; notice?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/orgs";
  const q = next !== "/orgs" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          New here? <Link href={`/signup${q}`} className="font-semibold text-teal-700">Create an account</Link>
        </>
      }
    >
      <Banner error={sp.error} notice={sp.notice ?? (sp.sent ? "Check your email for the sign-in link." : undefined)} />
      <form action={signInWithPassword} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className={inputCls} />
        </Field>
        <PasswordField />
        <div className="text-right">
          <Link href="/forgot" className="text-sm text-teal-700">Forgot password?</Link>
        </div>
        <SubmitButton className="w-full py-3" pendingText="Signing in…">Sign in</SubmitButton>
      </form>

      <Divider text="or" />
      <OAuthButtons next={next} />

      <details className="mt-6 text-center text-sm text-stone-500">
        <summary className="cursor-pointer">Email me a sign-in link instead</summary>
        <form action={sendMagicLink} className="mt-3 space-y-2 text-left">
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" required placeholder="you@example.com" autoComplete="email" className={inputCls} />
          <SubmitButton variant="ghost" className="w-full" pendingText="Sending…">Send link</SubmitButton>
        </form>
      </details>
    </AuthShell>
  );
}
