import { APP_NAME } from "@/lib/constants";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0f766e" />
      <path d="M9 12h12l-3.5-3.5M23 20H11l3.5 3.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className={`text-base font-bold tracking-tight ${light ? "text-white" : "text-stone-900"}`}>{APP_NAME}</span>
    </span>
  );
}
