import Link from "next/link";
import { Logo } from "./Logo";

export function AuthShell({ title, sub, children, footer }: { title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-stone-500">{sub}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-stone-600">{footer}</div>}
    </main>
  );
}

export function PasswordField({ name = "password", label = "Password", autoComplete = "current-password" }: { name?: string; label?: string; autoComplete?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <input
        name={name}
        type="password"
        required
        minLength={8}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
      />
    </label>
  );
}
