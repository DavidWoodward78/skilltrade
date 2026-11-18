import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinResultPath } from "@/lib/join";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_org", { p_code: code });
  if (error || !data) {
    return NextResponse.redirect(new URL(`/orgs?error=${encodeURIComponent(error?.message ?? "Invite not found")}`, request.url));
  }
  return NextResponse.redirect(new URL(joinResultPath(data), request.url));
}
