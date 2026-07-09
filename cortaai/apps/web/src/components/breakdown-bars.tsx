// Lightweight score-breakdown bars (no charting lib — keeps bundles small).

import { scoreHex } from "@/lib/utils";

export function BreakdownBars({ breakdown }: { breakdown: { label: string; value: number }[] }) {
  return (
    <div className="space-y-2.5">
      {breakdown.map((b) => (
        <div key={b.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-400">{b.label}</span>
            <span className="font-mono font-semibold" style={{ color: scoreHex(b.value) }}>
              {b.value}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${b.value}%`, backgroundColor: scoreHex(b.value) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
