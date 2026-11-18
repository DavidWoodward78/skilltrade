"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GitHubIcon, LinkedInIcon } from "./Verified";

type Provider = "github" | "linkedin_oidc";

export function ConnectAccounts({ github, linkedin, back }: { github: string | null; linkedin: boolean; back: string }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(provider: Provider) {
    setBusy(provider);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(back)}` },
    });
    if (error) {
      setBusy(null);
      setError(
        error.message.toLowerCase().includes("manual linking")
          ? "Connecting accounts isn't switched on yet. Ask the site admin to enable manual linking in Supabase."
          : error.message,
      );
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  const rows = [
    { id: "linkedin_oidc" as const, label: "LinkedIn", icon: <LinkedInIcon size={18} />, done: linkedin, detail: linkedin ? "Connected" : "Shows you're a real professional" },
    { id: "github" as const, label: "GitHub", icon: <GitHubIcon size={18} />, done: !!github, detail: github ? `Connected as @${github}` : "Best for developers: links your code history" },
  ];

  return (
    <div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
            <span className="flex items-center gap-3">
              <span className="text-stone-800">{r.icon}</span>
              <span className="text-sm">
                <span className="block font-medium">{r.label}</span>
                <span className="block text-xs text-stone-500">{r.detail}</span>
              </span>
            </span>
            {r.done ? (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">Verified ✓</span>
            ) : (
              <button
                type="button"
                onClick={() => connect(r.id)}
                disabled={!!busy}
                className="rounded-xl border border-stone-300 px-3 py-1.5 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
              >
                {busy === r.id ? "Opening…" : "Connect"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
