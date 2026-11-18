import { AuthShell, PasswordField } from "@/components/AuthShell";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/supabase/server";
import { updatePassword } from "../login/actions";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { user } = await requireUser();
  return (
    <AuthShell title="Set a new password" sub={`For ${user.email}`}>
      <Banner error={sp.error} />
      <form action={updatePassword} className="space-y-3">
        <PasswordField label="New password (8+ characters)" autoComplete="new-password" />
        <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />
        <SubmitButton className="w-full py-3" pendingText="Saving…">Save password</SubmitButton>
      </form>
    </AuthShell>
  );
}
