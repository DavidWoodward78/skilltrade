import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/plans";

/** Server-only client that bypasses Row Level Security. Used by the Stripe webhook. Never import in client code. */
export function createAdminClient() {
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}
