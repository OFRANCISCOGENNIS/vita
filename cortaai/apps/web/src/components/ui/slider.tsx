"use client";

import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label?: string;
  className?: string;
  "aria-label"?: string;
}

export function Slider({ value, min, max, step = 1, onChange, label, className, ...aria }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span className="font-mono text-zinc-300">{value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={aria["aria-label"] ?? label ?? "Controle deslizante"}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        style={{
          background: `linear-gradient(to right, #8b5cf6 ${pct}%, #1e1e2a ${pct}%)`,
        }}
      />
    </div>
  );
}
