import Link from "next/link";
import { AuthShell, PasswordField } from "@/components/AuthShell";
import { Divider, OAuthButtons } from "@/components/OAuthButtons";
import { Banner, Field, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { signUpWithPassword } from "../login/actions";

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next ?? "/orgs";
  const q = next !== "/orgs" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthShell
      title="Create your account"
      sub="Free for members. Signing up with LinkedIn or GitHub adds a verified badge."
      footer={
        <>
          Already have an account? <Link href={`/login${q}`} className="font-semibold text-teal-700">Sign in</Link>
        </>
      }
    >
      <Banner error={sp.error} />
      <OAuthButtons next={next} label="Sign up" />
      <Divider text="or use email" />
      <form action={signUpWithPassword} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <Field label="Your name">
          <input name="name" required maxLength={60} autoComplete="name" className={inputCls} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className={inputCls} />
        </Field>
        <PasswordField label="Password (8+ characters)" autoComplete="new-password" />
        <PasswordField name="confirm" label="Confirm password" autoComplete="new-password" />
        <SubmitButton className="w-full py-3" pendingText="Creating…">Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
