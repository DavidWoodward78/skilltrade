import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_org", { p_code: code });
  if (error || !data) {
    return NextResponse.redirect(new URL(`/orgs?error=${encodeURIComponent(error?.message ?? "Invite not found")}`, request.url));
  }
  const notice = encodeURIComponent("Welcome! Add what you offer and need so people can find you.");
  return NextResponse.redirect(new URL(`/o/${data.slug}/profile?notice=${notice}`, request.url));
}
