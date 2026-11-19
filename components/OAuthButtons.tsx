import { GitHubIcon, LinkedInIcon } from "./Verified";
import { signInWithProvider } from "@/app/login/actions";

export function OAuthButtons({ next, label = "Continue" }: { next: string; label?: string }) {
  return (
    <div className="space-y-2">
      <form action={signInWithProvider}>
        <input type="hidden" name="provider" value="linkedin_oidc" />
        <input type="hidden" name="next" value={next} />
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0a66c2] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#09579f] active:scale-[0.98]">
          <LinkedInIcon size={18} /> {label} with LinkedIn
        </button>
      </form>
      <form action={signInWithProvider}>
        <input type="hidden" name="provider" value="github" />
        <input type="hidden" name="next" value={next} />
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.98]">
          <GitHubIcon size={18} /> {label} with GitHub
        </button>
      </form>
      <form action={signInWithProvider}>
        <input type="hidden" name="provider" value="slack_oidc" />
        <input type="hidden" name="next" value={next} />
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4a154b] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3b113c] active:scale-[0.98]">
          {label} with Slack
        </button>
      </form>
    </div>
  );
}

export function Divider({ text }: { text: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
      <span className="h-px flex-1 bg-stone-200" /> {text} <span className="h-px flex-1 bg-stone-200" />
    </div>
  );
}
