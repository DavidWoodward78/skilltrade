"use client";
import { useState } from "react";

/** Share sheet on phones, copy-to-clipboard everywhere. */
export function InviteShare({ url, orgName, compact = false }: { url: string; orgName: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = `Join ${orgName} on SkillTrade: trade skills with other members, agree the work, and build a track record.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link:", url);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${orgName} on SkillTrade`, text, url });
      } catch {
        // dismissed
      }
      return;
    }
    copy();
  }

  const shareIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-600 active:scale-[0.98]"
      >
        {shareIcon} {copied ? "Link copied" : "Invite"}
      </button>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-600 active:scale-[0.98]"
      >
        {shareIcon} Share invite
      </button>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]"
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}
