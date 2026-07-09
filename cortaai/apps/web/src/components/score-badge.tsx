import { Flame } from "lucide-react";
import { cn, scoreColor } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  label?: string;
  size?: "sm" | "lg";
  className?: string;
}

/** 0-100 score badge with color scale (retention index / viral score). */
export function ScoreBadge({ score, label, size = "sm", className }: ScoreBadgeProps) {
  const c = scoreColor(score);
  return (
    <span
      title={label}
      aria-label={`${label ?? "Índice"}: ${score} de 100`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold ring-1 ring-inset",
        c.text,
        c.bg,
        c.ring,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className,
      )}
    >
      <Flame className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} aria-hidden />
      {score}
    </span>
  );
}
