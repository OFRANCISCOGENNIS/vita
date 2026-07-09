"use client";

// Correção de cor + presets (LUT-like). Sliders write into edit state (undoable)
// and the preview reflects them live via CSS filter + overlays.

import { RotateCcw } from "lucide-react";
import { LOOKS } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

const CONTROLS: { key: "brightness" | "contrast" | "saturation" | "temperature" | "tint" | "exposure" | "vignette"; label: string; min: number; max: number }[] = [
  { key: "exposure", label: "Exposição", min: -100, max: 100 },
  { key: "brightness", label: "Brilho", min: -100, max: 100 },
  { key: "contrast", label: "Contraste", min: -100, max: 100 },
  { key: "saturation", label: "Saturação", min: -100, max: 100 },
  { key: "temperature", label: "Temperatura (frio ↔ quente)", min: -100, max: 100 },
  { key: "tint", label: "Tonalidade (verde ↔ magenta)", min: -100, max: 100 },
  { key: "vignette", label: "Vinheta", min: 0, max: 100 },
];

export function ColorPanel() {
  const { doc, setColorGrade, applyLook, resetColorGrade } = useEditorStore();
  const cg = doc.colorGrade;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Looks (1 clique)</h3>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Looks de cor">
          {LOOKS.map((l) => (
            <button
              key={l.id}
              onClick={() => applyLook(l.id)}
              aria-pressed={cg.look === l.id}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                cg.look === l.id ? "border-violet-500/60 bg-violet-500/10" : "border-line bg-surface-2 hover:border-violet-500/40",
              )}
            >
              <span className="text-lg" aria-hidden>{l.emoji}</span>
              <span className="text-[11px] font-medium text-zinc-300">{l.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ajuste fino</h3>
          <button
            onClick={resetColorGrade}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-zinc-400 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <RotateCcw className="h-3 w-3" aria-hidden /> Redefinir
          </button>
        </div>
        {CONTROLS.map((c) => (
          <Slider
            key={c.key}
            label={c.label}
            min={c.min}
            max={c.max}
            value={cg[c.key]}
            onChange={(v) => setColorGrade({ [c.key]: v })}
          />
        ))}
      </section>

      <p className="text-xs leading-relaxed text-zinc-500">
        Os ajustes são aplicados ao preview em tempo real (filtro CSS + camadas de
        temperatura e vinheta) e entram no histórico de desfazer/refazer.
      </p>
    </div>
  );
}
