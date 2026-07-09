"use client";

// Velocidade / speed ramp: per-clip base rate + speed keyframes on the timeline.
// The preview shows a live playback-rate indicator; the timeline visualizes the
// ramp.

import { Diamond, Gauge, Plus, Trash2 } from "lucide-react";
import { speedAt } from "@/lib/edit-visuals";
import { cn, formatDuration } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

const PRESET_RATES = [0.25, 0.5, 1, 1.5, 2, 4];

export function SpeedPanel() {
  const { doc, currentTime, setSpeed, addSpeedKeyframe, removeSpeedKeyframe } = useEditorStore();
  const speed = doc.speed;
  const effective = speedAt(speed, currentTime);

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Gauge className="h-4 w-4 text-violet-400" aria-hidden /> Velocidade do clipe
          </span>
          <span className="font-mono text-sm font-bold text-amber-300">{speed.rate.toFixed(2)}x</span>
        </div>
        <Slider
          label="Multiplicador (0.25x – 4x)"
          min={0.25}
          max={4}
          step={0.05}
          value={speed.rate}
          onChange={(v) => setSpeed({ rate: v })}
          aria-label="Velocidade do clipe"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Velocidades rápidas">
          {PRESET_RATES.map((r) => (
            <button
              key={r}
              onClick={() => setSpeed({ rate: r })}
              aria-pressed={Math.abs(speed.rate - r) < 0.001}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                Math.abs(speed.rate - r) < 0.001 ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
              )}
            >
              {r}x
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Speed ramp (keyframes)</h3>
          <button
            onClick={addSpeedKeyframe}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Plus className="h-3 w-3" aria-hidden /> Keyframe em {formatDuration(currentTime)}
          </button>
        </div>
        <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-zinc-400">
          Velocidade efetiva no playhead: <strong className="font-mono text-amber-300">{effective.toFixed(2)}x</strong>
        </p>
        {speed.keyframes.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhum keyframe. Ajuste a velocidade e adicione keyframes em pontos diferentes para criar uma rampa.</p>
        ) : (
          <ul className="space-y-1.5">
            {speed.keyframes.map((k) => (
              <li key={k.t} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
                <Diamond className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                <span className="font-mono text-zinc-300">{formatDuration(k.t)}</span>
                <span className="ml-auto font-mono font-bold text-amber-300">{k.rate.toFixed(2)}x</span>
                <button
                  onClick={() => removeSpeedKeyframe(k.t)}
                  aria-label={`Remover keyframe em ${formatDuration(k.t)}`}
                  className="rounded p-0.5 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
