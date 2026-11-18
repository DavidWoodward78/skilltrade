"use server";
import { joinResultPath } from "@/lib/join";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export async function createOrg(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const { data, error } = await supabase.rpc("create_org", { p_name: name });
  if (error) redirect(`/orgs?error=${encodeURIComponent(error.message)}`);
  redirect(`/o/${data.slug}/admin?notice=${encodeURIComponent("Community created. Share the invite link with members.")}`);
}

export async function joinOrg(formData: FormData) {
  const { supabase } = await requireUser();
  const raw = String(formData.get("code") ?? "").trim();
  const code = raw.includes("/join/") ? raw.split("/join/")[1].split(/[?#/]/)[0] : raw;
  const { data, error } = await supabase.rpc("join_org", { p_code: code });
  if (error) redirect(`/orgs?error=${encodeURIComponent(error.message)}`);
  redirect(joinResultPath(data));
}
