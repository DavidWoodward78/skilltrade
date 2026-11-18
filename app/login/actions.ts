"use server";
import { cookies, headers } from "next/headers";

const RESET_COOKIE = "st_pw_reset";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/orgs";
}

async function origin() {
  const h = await headers();
  // Same host the person is using, so the sign-in cookie set before the redirect is still there after it.
  return (h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(`/login?sent=1&next=${encodeURIComponent(next)}`);
}

export async function signInWithProvider(formData: FormData) {
  const provider = String(formData.get("provider")) === "github" ? "github" : "linkedin_oidc";
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: provider === "github" ? "read:user user:email" : undefined,
    },
  });
  if (error || !data.url) {
    const msg = error?.message.toLowerCase().includes("not enabled")
      ? `${provider === "github" ? "GitHub" : "LinkedIn"} sign-in isn't switched on yet. Use your email for now.`
      : (error?.message ?? "Could not start sign-in");
    redirect(`/login?error=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`);
  }
  redirect(data.url);
}

// ---------- Email + password ----------

function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password. If you used to sign in with a link, tap “Forgot password?” to set one.";
  if (m.includes("email not confirmed")) return "Confirm your email first: check your inbox for the link we sent.";
  if (m.includes("already registered") || m.includes("already been registered")) return "There's already an account with that email. Sign in instead, or reset your password.";
  if (m.includes("password should be") || m.includes("weak")) return "Use at least 8 characters for your password.";
  if (m.includes("rate limit") || m.includes("security purposes")) return "Too many tries. Wait a minute and try again.";
  return msg;
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(friendly(error.message))}&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signUpWithPassword(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const back = (e: string) => redirect(`/signup?error=${encodeURIComponent(e)}&next=${encodeURIComponent(next)}`);
  if (password.length < 8) back("Use at least 8 characters for your password.");
  if (password !== String(formData.get("confirm") ?? "")) back("The passwords don't match.");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) back(friendly(error.message));
  // Supabase hides whether an email is taken: it "succeeds" but sends nothing and
  // returns a user with no identities. Tell the person what to do instead.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    redirect(
      `/login?error=${encodeURIComponent("You already have an account with that email. Sign in below, or tap “Forgot password?” to set a password.")}&next=${encodeURIComponent(next)}`,
    );
  }
  // Email confirmation off: signed in right away. On: they confirm by email first.
  if (data.session) redirect(next);
  redirect(`/login?notice=${encodeURIComponent("Almost there: check your email and tap the link to confirm your account.")}&next=${encodeURIComponent(next)}`);
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  (await cookies()).set(RESET_COOKIE, "1", { maxAge: 60 * 60, httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  // Same message whether or not the account exists, so emails can't be probed.
  redirect(`/forgot?sent=1`);
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect(`/reset-password?error=${encodeURIComponent("Use at least 8 characters.")}`);
  if (password !== String(formData.get("confirm") ?? "")) redirect(`/reset-password?error=${encodeURIComponent("The passwords don't match.")}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/reset-password?error=${encodeURIComponent(friendly(error.message))}`);
  (await cookies()).delete(RESET_COOKIE);
  redirect(`/orgs?notice=${encodeURIComponent("Password saved. Use it next time you sign in.")}`);
}
