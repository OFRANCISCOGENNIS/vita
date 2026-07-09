import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  variant?: "clapper" | "radar" | "search" | "queue";
}

/** Illustrated empty state (inline SVG, no external assets). */
export function EmptyState({ title, description, action, className, variant = "clapper" }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-1/60 px-6 py-14 text-center", className)}>
      <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden className="mb-5 opacity-90">
        <defs>
          <linearGradient id={`eg-${variant}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#d946ef" />
          </linearGradient>
        </defs>
        {variant === "clapper" && (
          <g>
            <rect x="20" y="30" width="80" height="45" rx="8" fill="#1e1e2a" stroke="url(#eg-clapper)" strokeWidth="2" />
            <path d="M22 30 L98 30 L104 16 L28 16 Z" fill="#16161f" stroke="url(#eg-clapper)" strokeWidth="2" />
            <path d="M38 17 L46 29 M56 17 L64 29 M74 17 L82 29" stroke="#8b5cf6" strokeWidth="2.5" />
            <circle cx="60" cy="53" r="10" fill="rgba(139,92,246,0.2)" />
            <path d="M57 48 L66 53 L57 58 Z" fill="#a78bfa" />
          </g>
        )}
        {variant === "radar" && (
          <g>
            <circle cx="60" cy="48" r="34" stroke="#2e2e3f" strokeWidth="2" />
            <circle cx="60" cy="48" r="22" stroke="#2e2e3f" strokeWidth="2" />
            <circle cx="60" cy="48" r="10" stroke="#2e2e3f" strokeWidth="2" />
            <path d="M60 48 L88 26" stroke="url(#eg-radar)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="78" cy="60" r="4" fill="#d946ef" />
            <circle cx="44" cy="36" r="3" fill="#8b5cf6" />
          </g>
        )}
        {variant === "search" && (
          <g>
            <circle cx="52" cy="42" r="24" stroke="url(#eg-search)" strokeWidth="3" />
            <path d="M70 60 L88 78" stroke="url(#eg-search)" strokeWidth="4" strokeLinecap="round" />
            <path d="M42 42 h20 M52 32 v20" stroke="#3f3f50" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
        {variant === "queue" && (
          <g>
            <rect x="24" y="18" width="72" height="14" rx="7" fill="#16161f" stroke="#2e2e3f" strokeWidth="2" />
            <rect x="24" y="38" width="72" height="14" rx="7" fill="#16161f" stroke="#2e2e3f" strokeWidth="2" />
            <rect x="24" y="58" width="72" height="14" rx="7" fill="#16161f" stroke="#2e2e3f" strokeWidth="2" />
            <rect x="28" y="21" width="40" height="8" rx="4" fill="url(#eg-queue)" opacity="0.85" />
            <rect x="28" y="41" width="24" height="8" rx="4" fill="url(#eg-queue)" opacity="0.5" />
          </g>
        )}
      </svg>
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
