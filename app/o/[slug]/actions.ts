"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { back } from "@/lib/org";
import { CATEGORIES } from "@/lib/constants";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Every form posts a hidden "back" path; results return there with a message. */
function done(fd: FormData, msg: { error?: string; notice?: string }): never {
  const path = s(fd, "back");
  const safe = path.startsWith("/o/") ? path : "/orgs";
  revalidatePath(safe.split("?")[0]);
  redirect(back(safe, msg));
}

// ---------- Profile and skills ----------

export async function saveProfile(fd: FormData) {
  const { supabase, user } = await requireUser();
  const url = s(fd, "portfolio_url");
  if (url && !/^https?:\/\//i.test(url)) done(fd, { error: "Portfolio link must start with http:// or https://" });
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: s(fd, "display_name").slice(0, 60),
      headline: s(fd, "headline").slice(0, 120),
      bio: s(fd, "bio").slice(0, 1000),
      portfolio_url: url,
      availability: s(fd, "availability").slice(0, 80),
    })
    .eq("id", user.id);
  done(fd, error ? { error: error.message } : { notice: "Profile saved." });
}

export async function addSkill(fd: FormData) {
  const { supabase, user } = await requireUser();
  const kind = s(fd, "kind");
  const category = s(fd, "category");
  if (!["offer", "need"].includes(kind) || !(CATEGORIES as readonly string[]).includes(category)) {
    done(fd, { error: "Pick a category." });
  }
  const { count } = await supabase
    .from("user_skills")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("kind", kind);
  if ((count ?? 0) >= 5) done(fd, { error: "Keep it focused: up to 5 skills on each side." });
  const { error } = await supabase.from("user_skills").insert({
    user_id: user.id,
    kind,
    category,
    skill: s(fd, "skill").slice(0, 80) || category,
    level: Number(s(fd, "level")) || 2,
  });
  done(fd, error ? { error: error.message } : { notice: "Skill added." });
}

export async function removeSkill(fd: FormData) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("user_skills").delete().eq("id", s(fd, "id")).eq("user_id", user.id);
  done(fd, error ? { error: error.message } : { notice: "Skill removed." });
}

// ---------- Matching ----------

export async function expressInterest(fd: FormData) {
  const { supabase, user } = await requireUser();
  const orgId = s(fd, "org_id");
  const to = s(fd, "to_user");
  const { error } = await supabase.from("interests").insert({ org_id: orgId, from_user: user.id, to_user: to });
  if (error && !error.message.includes("duplicate")) done(fd, { error: error.message });
  const { data: match } = await supabase
    .from("matches")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_a", user.id < to ? user.id : to)
    .eq("user_b", user.id < to ? to : user.id)
    .maybeSingle();
  if (match) {
    const slug = s(fd, "slug");
    redirect(`/o/${slug}/matches/${match.id}?notice=${encodeURIComponent("It's a match! Say hi and agree a trade.")}`);
  }
  done(fd, { notice: "Interest sent. You'll match if they're interested too." });
}

/** Used by the swipe deck: returns a result instead of redirecting. */
export async function swipeInterest(orgId: string, slug: string, to: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("interests").insert({ org_id: orgId, from_user: user.id, to_user: to });
  if (error && !error.message.includes("duplicate")) return { error: error.message };
  const { data: match } = await supabase
    .from("matches")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_a", user.id < to ? user.id : to)
    .eq("user_b", user.id < to ? to : user.id)
    .maybeSingle();
  revalidatePath(`/o/${slug}`);
  return { matchId: match?.id as string | undefined };
}

export async function withdrawInterest(fd: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("interests").delete().eq("org_id", s(fd, "org_id")).eq("from_user", user.id).eq("to_user", s(fd, "to_user"));
  done(fd, { notice: "Interest withdrawn." });
}

export async function sendMessage(fd: FormData) {
  const { supabase, user } = await requireUser();
  const body = s(fd, "body");
  if (!body) return;
  const { error } = await supabase.from("messages").insert({ match_id: s(fd, "match_id"), sender_id: user.id, body });
  if (error) done(fd, { error: error.message });
  revalidatePath(s(fd, "back"));
}

// ---------- Trades ----------

export async function proposeTrade(fd: FormData) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("propose_trade", {
    p_match: s(fd, "match_id"),
    p_i_give: s(fd, "i_give"),
    p_they_give: s(fd, "they_give"),
    p_my_hours: Number(s(fd, "my_hours")),
    p_their_hours: Number(s(fd, "their_hours")),
    p_due: s(fd, "due_date"),
    p_done: s(fd, "definition_of_done"),
  });
  if (error) done(fd, { error: error.message });
  redirect(`/o/${s(fd, "slug")}/trades/${data.id}?notice=${encodeURIComponent("Trade Card sent. It starts when they accept.")}`);
}

export async function respondTrade(fd: FormData) {
  const { supabase } = await requireUser();
  const accept = s(fd, "accept") === "1";
  const { error } = await supabase.rpc("respond_trade", { p_trade: s(fd, "trade_id"), p_accept: accept });
  done(fd, error ? { error: error.message } : { notice: accept ? "Trade accepted. Time to deliver." : "Trade declined." });
}

export async function cancelTrade(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_trade", { p_trade: s(fd, "trade_id"), p_reason: s(fd, "reason") });
  done(fd, error ? { error: error.message } : { notice: "Trade cancelled. It shows on your history with your reason." });
}

export async function confirmDelivery(fd: FormData) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("confirm_delivery", { p_trade: s(fd, "trade_id") });
  if (error) done(fd, { error: error.message });
  done(fd, {
    notice: data.status === "completed" ? "Trade complete! Leave a quick review." : "Confirmed. Waiting on their confirmation.",
  });
}

export async function addMilestone(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("add_milestone", {
    p_trade: s(fd, "trade_id"),
    p_owner: s(fd, "owner_id"),
    p_title: s(fd, "title"),
    p_due: s(fd, "due_date") || null,
  });
  done(fd, error ? { error: error.message } : { notice: "Milestone added." });
}

export async function submitMilestone(fd: FormData) {
  const { supabase } = await requireUser();
  const url = s(fd, "proof_url");
  if (url && !/^https?:\/\//i.test(url)) done(fd, { error: "Proof link must start with http:// or https://" });
  const { error } = await supabase.rpc("submit_milestone", {
    p_milestone: s(fd, "milestone_id"),
    p_proof_url: url,
    p_note: s(fd, "proof_note"),
  });
  done(fd, error ? { error: error.message } : { notice: "Delivered. They'll confirm it." });
}

export async function confirmMilestone(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("confirm_milestone", { p_milestone: s(fd, "milestone_id") });
  done(fd, error ? { error: error.message } : { notice: "Milestone confirmed." });
}

export async function leaveReview(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("leave_review", {
    p_trade: s(fd, "trade_id"),
    p_rating: Number(s(fd, "rating")),
    p_comment: s(fd, "comment"),
  });
  done(fd, error ? { error: error.message.includes("duplicate") ? "You already reviewed this trade." : error.message } : { notice: "Thanks for the review." });
}

// ---------- Safety ----------

export async function reportUser(fd: FormData) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("reports").insert({
    org_id: s(fd, "org_id"),
    reporter_id: user.id,
    reported_id: s(fd, "reported_id"),
    trade_id: s(fd, "trade_id") || null,
    reason: s(fd, "reason"),
  });
  done(fd, error ? { error: "Add a few words about what happened." } : { notice: "Report sent privately to the community admins." });
}

export async function blockUser(fd: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: s(fd, "blocked_id") });
  redirect(`/o/${s(fd, "slug")}?notice=${encodeURIComponent("Blocked. You won't see each other.")}`);
}

// ---------- Admin ----------

export async function setRole(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("memberships")
    .update({ role: s(fd, "role") === "admin" ? "admin" : "member" })
    .eq("org_id", s(fd, "org_id"))
    .eq("user_id", s(fd, "user_id"));
  done(fd, error ? { error: error.message } : { notice: "Role updated." });
}

export async function removeMember(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("memberships").delete().eq("org_id", s(fd, "org_id")).eq("user_id", s(fd, "user_id"));
  done(fd, error ? { error: error.message } : { notice: "Member removed." });
}

export async function rotateInvite(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("rotate_invite_code", { p_org: s(fd, "org_id") });
  done(fd, error ? { error: error.message } : { notice: "New invite link created. The old one no longer works." });
}

export async function resolveReport(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("reports").update({ resolved_at: new Date().toISOString() }).eq("id", s(fd, "report_id"));
  done(fd, error ? { error: error.message } : { notice: "Report resolved." });
}

export async function leaveOrg(fd: FormData) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("memberships").delete().eq("org_id", s(fd, "org_id")).eq("user_id", user.id);
  if (error) done(fd, { error: error.message });
  redirect("/orgs");
}

// ---------- Public portfolio ----------

const RESERVED = new Set(["admin", "api", "app", "login", "auth", "orgs", "join", "help", "support", "about", "settings", "new"]);

export async function savePortfolio(fd: FormData) {
  const { supabase, user } = await requireUser();
  const username = s(fd, "username").toLowerCase();
  const makePublic = fd.get("portfolio_public") === "on";
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(username)) {
    done(fd, { error: "Usernames are 3–30 lowercase letters, numbers or dashes, and can't start or end with a dash." });
  }
  if (RESERVED.has(username)) done(fd, { error: "That username is reserved. Try another." });
  const { error } = await supabase
    .from("profiles")
    .update({ username, portfolio_public: makePublic })
    .eq("id", user.id);
  if (error) {
    done(fd, { error: error.message.includes("duplicate") ? "That username is taken. Try another." : error.message });
  }
  done(fd, { notice: makePublic ? "Your portfolio is public. Share the link!" : "Portfolio saved and kept private." });
}

export async function setShowcase(fd: FormData) {
  const { supabase } = await requireUser();
  const show = s(fd, "show") === "1";
  const { error } = await supabase.rpc("set_showcase", { p_trade: s(fd, "trade_id"), p_show: show });
  done(fd, error ? { error: error.message } : { notice: show ? "Shown on your portfolio." : "Hidden from your portfolio." });
}

export async function pauseMember(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("memberships")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: "Paused by an admin" })
    .eq("org_id", s(fd, "org_id"))
    .eq("user_id", s(fd, "user_id"));
  done(fd, error ? { error: error.message } : { notice: "Member paused. They can't start new matches or trades." });
}

export async function reinstateMember(fd: FormData) {
  const { supabase } = await requireUser();
  const orgId = s(fd, "org_id");
  const userId = s(fd, "user_id");
  const { error } = await supabase
    .from("memberships")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (error) done(fd, { error: error.message });
  // clear the reports that triggered the pause so it doesn't immediately re-trigger
  await supabase.from("reports").update({ resolved_at: new Date().toISOString() }).eq("org_id", orgId).eq("reported_id", userId).is("resolved_at", null);
  done(fd, { notice: "Member reinstated and their open reports resolved." });
}
