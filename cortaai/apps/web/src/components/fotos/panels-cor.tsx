"use client";

// Cor (HSL) tab — per-band hue/saturation/luminance shifts across 8 color
// ranges (vermelhos → magentas), like Lightroom's HSL mixer.

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { HSL_BANDS, neutralHsl, type HslBandId } from "@/lib/photo-engine";
import { usePhotoEditorStore } from "@/store/photo-editor";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

export function CorHslPanel() {
  const hsl = usePhotoEditorStore((s) => s.params.hsl);
  const setHsl = usePhotoEditorStore((s) => s.setHsl);
  const [band, setBand] = useState<HslBandId>("vermelhos");

  const shift = hsl[band];
  const def = HSL_BANDS.find((b) => b.id === band)!;

  function patchBand(patch: Partial<{ h: number; s: number; l: number }>) {
    setHsl({ ...hsl, [band]: { ...shift, ...patch } });
  }

  const touched = HSL_BANDS.filter((b) => {
    const v = hsl[b.id];
    return v.h !== 0 || v.s !== 0 || v.l !== 0;
  }).map((b) => b.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cor por faixa (HSL)</h3>
        <Button size="sm" variant="ghost" onClick={() => setHsl(neutralHsl())} aria-label="Resetar todas as faixas de cor">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Resetar
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Faixa de cor">
        {HSL_BANDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBand(b.id)}
            aria-pressed={band === b.id}
            aria-label={`Faixa ${b.label}${touched.includes(b.id) ? " (ajustada)" : ""}`}
            title={b.label}
            className={cn(
              "relative flex h-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              band === b.id ? "border-white/70 ring-1 ring-white/40" : "border-line hover:border-zinc-500",
            )}
            style={{ background: `${b.swatch}33` }}
          >
            <span className="h-4 w-4 rounded-full" style={{ background: b.swatch }} aria-hidden />
            {touched.includes(b.id) && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-3">
        <p className="text-xs font-semibold" style={{ color: def.swatch }}>{def.label}</p>
        <Slider label="Matiz" min={-100} max={100} value={shift.h} onChange={(v) => patchBand({ h: v })} aria-label={`Matiz de ${def.label}`} />
        <Slider label="Saturação" min={-100} max={100} value={shift.s} onChange={(v) => patchBand({ s: v })} aria-label={`Saturação de ${def.label}`} />
        <Slider label="Luminância" min={-100} max={100} value={shift.l} onChange={(v) => patchBand({ l: v })} aria-label={`Luminância de ${def.label}`} />
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Os ajustes atingem apenas os pixels daquela faixa de matiz, com transição suave entre faixas vizinhas.
      </p>
    </div>
  );
}
