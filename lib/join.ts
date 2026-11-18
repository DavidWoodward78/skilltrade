type JoinResult = { status: "joined" | "already" | "pending" | "full" | "domain"; slug?: string; name: string; domain?: string };

/** Where to send someone after they use an invite link, with a message that explains what happened. */
export function joinResultPath(r: JoinResult): string {
  const q = (k: "notice" | "error", m: string) => `${k}=${encodeURIComponent(m)}`;
  switch (r.status) {
    case "joined":
      return `/o/${r.slug}/profile?${q("notice", "Welcome! Add what you offer and need so people can find you.")}`;
    case "already":
      return `/o/${r.slug}`;
    case "pending":
      return `/orgs?${q("notice", `Request sent to ${r.name}. An admin will approve it, then the community shows up here.`)}`;
    case "full":
      return `/orgs?${q("error", `${r.name} is full right now. Ask an admin to upgrade their plan.`)}`;
    case "domain":
      return `/orgs?${q("error", `${r.name} only accepts @${r.domain} email addresses. Sign in with that address to join.`)}`;
  }
}
