import { APP_NAME } from "@/lib/constants";

/** Concept A, "Swap": two arrows, one teal-white and one amber, for a two-sided trade. */
export function LogoMark({ size = 28, light = false }: { size?: number; light?: boolean }) {
  const bg = light ? "#14b8a6" : "#0f766e";
  const fg = light ? "#0f2f2b" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill={bg} />
      <path d="M17 24h28l-8-8" fill="none" stroke={fg} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M47 40H19l8 8" fill="none" stroke="#f59e0b" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark light={light} />
      <span className={`text-base font-bold tracking-tight ${light ? "text-white" : "text-stone-900"}`}>{APP_NAME}</span>
    </span>
  );
}
