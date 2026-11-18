import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_STYLE, type Trade } from "@/lib/constants";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_-8px_rgba(0,0,0,0.08)] ${className}`}>{children}</div>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-stone-500">{sub}</p>}
    </div>
  );
}

export function Banner({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-4 rounded-xl px-3 py-2 text-sm ${error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}
    >
      {error ?? notice}
    </div>
  );
}

export function StatusBadge({ status }: { status: Trade["status"] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status]}`}>{status}</span>
  );
}

export function Chip({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "teal" | "amber" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    teal: "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-600/15",
    amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/15",
  };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const inputCls =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20";

export const btnCls =
  "inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-900/20 transition hover:bg-teal-800 active:scale-[0.98] disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Empty({ children, href, cta }: { children: ReactNode; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
      <p>{children}</p>
      {href && cta && (
        <Link href={href} className={`${btnCls} mt-3`}>
          {cta}
        </Link>
      )}
    </div>
  );
}

export function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(Number(n) * 100)}%`;
}
