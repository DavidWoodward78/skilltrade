"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export async function ownerSetPlan(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("owner_set_plan", {
    p_org: String(fd.get("org_id")),
    p_plan: String(fd.get("plan")),
    p_limit: Number(fd.get("limit")) || 50,
  });
  revalidatePath("/owner");
  redirect(`/owner?${error ? "error" : "notice"}=${encodeURIComponent(error ? error.message : "Saved.")}`);
}
