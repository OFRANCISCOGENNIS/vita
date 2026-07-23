"use client";

// Biblioteca de efeitos (CapCut Pro): galeria de FX de 1 clique com prévia ao
// vivo. Cada efeito é ligável e tem intensidade; aplicado ao preview via
// classes/filtros/overlays CSS. Os valores vivem no EditorDoc (undo/redo).
// INTEGRAÇÃO real: FFmpeg/backend — cada FX vira um filtro no pipeline de render.

import { RotateCcw } from "lucide-react";
import { FX_META, type FxId } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

export function FxPanel() {
  const { doc, setFx, resetFx } = useEditorStore();
  const fx = doc.fx;
  const activeCount = FX_META.filter((m) => fx[m.id].enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Biblioteca de efeitos {activeCount > 0 && <span className="text-fuchsia-400">· {activeCount} ativo(s)</span>}
        </h3>
        <button
          onClick={resetFx}
          disabled={activeCount === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-zinc-400 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-40 disabled:pointer-events-none"
        >
          <RotateCcw className="h-3 w-3" aria-hidden /> Limpar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Efeitos visuais">
        {FX_META.map((m) => {
          const item = fx[m.id];
          return (
            <div
              key={m.id}
              className={cn(
                "rounded-xl border p-2.5 transition-colors",
                item.enabled ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-line bg-surface-2",
              )}
            >
              <button
                onClick={() => setFx(m.id as FxId, { enabled: !item.enabled })}
                aria-pressed={item.enabled}
                className="flex w-full items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                title={m.desc}
              >
                <span className="text-lg leading-none" aria-hidden>{m.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-100">{m.label}</span>
                  <span className="block text-[10px] leading-tight text-zinc-500">{m.desc}</span>
                </span>
              </button>
              {item.enabled && (
                <div className="mt-2">
                  <Slider
                    label="Intensidade"
                    min={0}
                    max={100}
                    value={item.intensity}
                    onChange={(v) => setFx(m.id as FxId, { intensity: v })}
                    aria-label={`Intensidade de ${m.label}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        Os efeitos são aplicados ao preview em tempo real (transform/filtro/overlay CSS).
        Na exportação real cada efeito é reprocessado no vídeo original.
      </p>
    </div>
  );
}
