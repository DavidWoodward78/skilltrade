"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callSlack } from "@/lib/slack/api";
import { slackEnv } from "@/lib/slack/config";
import { decryptToken } from "@/lib/slack/crypto";
import { back } from "@/lib/org";

/** Admin turns Slack off: revoke the bot token at Slack and disable the link. */
export async function disconnectSlack(fd: FormData) {
  const orgId = String(fd.get("org_id") ?? "");
  const slug = String(fd.get("slug") ?? "");
  const path = `/o/${slug}/admin`;
  const { supabase } = await requireUser();
  const { data: isAdmin } = await supabase.rpc("is_admin", { p_org: orgId });
  if (!isAdmin) redirect(back(path, { error: "Admins only" }));

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("slack_workspaces")
    .select("team_id, bot_token_enc")
    .eq("org_id", orgId)
    .is("disabled_at", null)
    .maybeSingle();
  if (ws) {
    try {
      await callSlack("auth.revoke", decryptToken(ws.bot_token_enc, slackEnv().encryptionKey), {});
    } catch (e) {
      console.error("[slack] revoke", e); // disable locally regardless
    }
    await admin.rpc("slack_disable_team", { p_team: ws.team_id, p_reason: "disconnected_by_admin" });
  }
  revalidatePath(path);
  redirect(back(path, { notice: "Slack disconnected." }));
}
