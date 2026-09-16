"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "border border-border-subtle bg-surface-raised text-ink hover:border-border-strong hover:bg-surface",
  primary: "border border-accent bg-accent text-white hover:opacity-90",
  ghost: "border border-transparent text-ink-muted hover:bg-accent-soft hover:text-ink",
  danger:
    "border border-border-subtle bg-surface-raised text-danger hover:border-danger hover:bg-surface",
};

export function Button({ variant = "default", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** Uppercase section heading used throughout the side panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-sm border border-border-subtle bg-surface-raised px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus-visible:outline-none";
