import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "accent" | "outline";

const variants: Record<Variant, string> = {
  default: "bg-white/10 text-zinc-200",
  success: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30",
  warning: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/30",
  danger: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/30",
  info: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/30",
  accent: "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/30",
  outline: "border border-line text-zinc-300",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
