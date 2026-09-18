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

type SegmentedProps<T extends string> = {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Labels the group for screen readers, e.g. "View mode". */
  label: string;
  className?: string;
};

/**
 * A row of mutually exclusive choices sharing one border — used where a
 * dropdown would be heavier than the decision warrants.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-sm border border-border-subtle bg-surface-raised p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${
              active
                ? "bg-accent-soft text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Initials square. No photo uploads, so initials are the whole identity. */
export function Avatar({ initials, size = 22 }: { initials: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-accent-soft font-medium uppercase tracking-[0.04em] text-ink-muted"
    >
      {initials}
    </span>
  );
}
