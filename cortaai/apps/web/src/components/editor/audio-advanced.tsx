"use client";

// Áudio avançado: fade in/out + a simple 3-band EQ (graves/médios/agudos) with
// a visual response curve. Values live in edit state (undoable). The fade
// handles are also drawn on the timeline audio track.

import { useMemo } from "react";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

const BANDS: { key: "eqLow" | "eqMid" | "eqHigh"; label: string }[] = [
  { key: "eqLow", label: "Graves" },
  { key: "eqMid", label: "Médios" },
  { key: "eqHigh", label: "Agudos" },
];

export function AudioAdvanced() {
  const { cut, doc, setAudioAdvanced } = useEditorStore();
  const a = doc.audioAdvanced;
  const duration = cut ? cut.endSeconds - cut.startSeconds : 0;

  // Build a smooth EQ response curve from the three band gains.
  const curve = useMemo(() => {
    const W = 240;
    const H = 60;
    const pts: string[] = [];
    const gains = [a.eqLow, a.eqLow, a.eqMid, a.eqMid, a.eqHigh, a.eqHigh];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      // sample the gains array with linear interpolation
      const gp = t * (gains.length - 1);
      const gi = Math.floor(gp);
      const gf = gp - gi;
      const g = gains[gi] + ((gains[Math.min(gains.length - 1, gi + 1)] ?? gains[gi]) - gains[gi]) * gf;
      const x = t * W;
      const y = H / 2 - (g / 12) * (H / 2 - 6);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return { W, H, points: pts.join(" ") };
  }, [a.eqLow, a.eqMid, a.eqHigh]);

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Áudio avançado</h3>

      {/* Fades */}
      <div className="space-y-3">
        <Slider
          label={`Fade in (${a.fadeInSec.toFixed(1)}s)`}
          min={0}
          max={Math.max(1, Math.min(5, Math.round(duration / 2)))}
          step={0.1}
          value={a.fadeInSec}
          onChange={(v) => setAudioAdvanced({ fadeInSec: v })}
        />
        <Slider
          label={`Fade out (${a.fadeOutSec.toFixed(1)}s)`}
          min={0}
          max={Math.max(1, Math.min(5, Math.round(duration / 2)))}
          step={0.1}
          value={a.fadeOutSec}
          onChange={(v) => setAudioAdvanced({ fadeOutSec: v })}
        />
      </div>

      {/* EQ visual */}
      <div>
        <p className="mb-1.5 text-xs text-zinc-400">Equalizador de 3 bandas</p>
        <svg viewBox={`0 0 ${curve.W} ${curve.H}`} className="h-16 w-full rounded-lg bg-surface-1" role="img" aria-label="Resposta do equalizador">
          <line x1="0" y1={curve.H / 2} x2={curve.W} y2={curve.H / 2} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <polyline points={curve.points} fill="none" stroke="#8b5cf6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {BANDS.map((b) => (
          <div key={b.key} className="text-center">
            <Slider
              label={b.label}
              min={-12}
              max={12}
              value={a[b.key]}
              onChange={(v) => setAudioAdvanced({ [b.key]: v })}
              aria-label={`${b.label} (dB)`}
            />
            <span className="font-mono text-[10px] text-zinc-500">{a[b.key] > 0 ? "+" : ""}{a[b.key]} dB</span>
          </div>
        ))}
      </div>
    </section>
  );
}
