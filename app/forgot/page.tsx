import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Banner, Field, inputCls } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { requestPasswordReset } from "../login/actions";

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell
      title="Reset your password"
      sub="We'll email you a link to set a new one. This also works if you've never set a password."
      footer={<Link href="/login" className="font-semibold text-teal-700">Back to sign in</Link>}
    >
      <Banner error={sp.error} notice={sp.sent ? "If there's an account with that email, a reset link is on its way. Check spam too." : undefined} />
      <form action={requestPasswordReset} className="space-y-3">
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className={inputCls} />
        </Field>
        <SubmitButton className="w-full py-3" pendingText="Sending…">Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}
