"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
}

export function Switch({ checked, onChange, label, description, className }: SwitchProps) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-3", className)}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-zinc-200">{label}</span>}
          {description && <span className="block text-xs text-zinc-500">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ?? "Alternar"}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
          checked ? "bg-gradient-to-r from-violet-600 to-fuchsia-600" : "bg-surface-3",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}
