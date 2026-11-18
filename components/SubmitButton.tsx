"use client";
import { useFormStatus } from "react-dom";
import { btnCls, btnGhostCls } from "./ui";

export function SubmitButton({
  children,
  variant = "primary",
  className = "",
  pendingText = "Saving…",
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  const base =
    variant === "ghost"
      ? btnGhostCls
      : variant === "danger"
        ? btnCls.replace("bg-teal-700", "bg-rose-700").replace("hover:bg-teal-800", "hover:bg-rose-800")
        : btnCls;
  return (
    <button type="submit" disabled={pending} className={`${base} ${className}`}>
      {pending ? pendingText : children}
    </button>
  );
}
