"use client";

// LUZ — presets de iluminação estilo Facetune (Hora Dourada, Manhã, Drama…).
// Relighting SIMULADO com filtro de cor + brilhos radiais + vinheta — honesto,
// 100% no navegador, destrutivo com undo.

import { Sun } from "lucide-react";
import { toast } from "@/store/toast";
import { applyLightingCanvas, LIGHTING_PRESETS } from "@/lib/photo-engine";
import { usePhotoEditorStore } from "@/store/photo-editor";

const EMOJI: Record<string, string> = {
  "hora-dourada": "🌇",
  manha: "🌤️",
  drama: "🎭",
  "meio-dia": "☀️",
  entardecer: "🌆",
  "neon-noite": "🌃",
};

export function LuzPanel() {
  const busy = usePhotoEditorStore((s) => s.busy);
  const applyPixelOp = usePhotoEditorStore((s) => s.applyPixelOp);
  const setBusy = usePhotoEditorStore((s) => s.setBusy);

  function apply(presetId: string, name: string) {
    if (busy) return;
    setBusy(`Aplicando luz "${name}"…`);
    setTimeout(() => {
      try {
        applyPixelOp((base) => applyLightingCanvas(base, presetId));
        toast(`Luz "${name}" aplicada`, { description: "Desfazer com Ctrl+Z se quiser trocar.", variant: "success" });
      } finally {
        setBusy(null);
      }
    }, 30);
  }

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Sun className="h-3.5 w-3.5" aria-hidden /> Luz
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {LIGHTING_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => apply(p.id, p.name)}
            disabled={!!busy}
            className="flex flex-col items-start gap-1 rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-left transition-all hover:border-violet-500/50 hover:bg-white/[0.04] active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <span className="text-lg" aria-hidden>
              {EMOJI[p.id] ?? "💡"}
            </span>
            <span className="text-[11px] font-medium leading-tight text-zinc-200">{p.name}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-600">
        Iluminação simulada com gradientes e correção de cor — não é relighting por IA. Cada aplicação entra no
        histórico (Ctrl+Z desfaz), então dá para experimentar à vontade.
      </p>
    </div>
  );
}
