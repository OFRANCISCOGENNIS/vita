"use client";

// Keyframes de camadas: animate position, scale, opacity and rotation of the
// headline / logo / sticker layers over time. Compact editor — add a keyframe
// at the playhead, tweak its pose, pick easing, remove.

import { useState } from "react";
import { Diamond, Plus, Trash2 } from "lucide-react";
import type { EaseId, LayerAnimId } from "@/lib/edit-visuals";
import { cn, formatDuration } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";
import { Select } from "@/components/ui/input";

const LAYERS: { id: LayerAnimId; label: string }[] = [
  { id: "headline", label: "Headline" },
  { id: "logo", label: "Logo / marca" },
  { id: "sticker", label: "Sticker" },
];

const EASES: EaseId[] = ["linear", "easeIn", "easeOut", "easeInOut"];

export function KeyframesPanel() {
  const { doc, currentTime, addLayerKeyframe, updateLayerKeyframe, removeLayerKeyframe, seek } = useEditorStore();
  const [layer, setLayer] = useState<LayerAnimId>("headline");
  const kfs = doc.layersAnim[layer];

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Animação de camadas (keyframes)</h3>

      <div className="flex gap-1.5" role="group" aria-label="Camada a animar">
        {LAYERS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLayer(l.id)}
            aria-pressed={layer === l.id}
            className={cn(
              "flex-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              layer === l.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
            )}
          >
            {l.label}
            {doc.layersAnim[l.id].length > 0 && <span className="ml-1 text-amber-300">•{doc.layersAnim[l.id].length}</span>}
          </button>
        ))}
      </div>

      <button
        onClick={() => addLayerKeyframe(layer)}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1.5 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <Plus className="h-3 w-3" aria-hidden /> Adicionar keyframe em {formatDuration(currentTime)}
      </button>

      {kfs.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Sem keyframes. Adicione um no início e outro mais adiante (após mover o playhead) para animar a camada.
        </p>
      ) : (
        <ul className="space-y-2">
          {kfs.map((k, i) => (
            <li key={i} className="rounded-lg border border-line bg-surface-1/60 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <Diamond className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                <button
                  onClick={() => seek(k.t)}
                  className="font-mono text-xs text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  aria-label={`Ir para ${formatDuration(k.t)}`}
                >
                  {formatDuration(k.t)}
                </button>
                <button
                  onClick={() => removeLayerKeyframe(layer, i)}
                  aria-label={`Remover keyframe ${i + 1}`}
                  className="ml-auto rounded p-0.5 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2.5">
                <Slider label="Posição X" min={-50} max={50} value={Math.round(k.x * 100)} onChange={(v) => updateLayerKeyframe(layer, i, { x: v / 100 })} />
                <Slider label="Posição Y" min={-50} max={50} value={Math.round(k.y * 100)} onChange={(v) => updateLayerKeyframe(layer, i, { y: v / 100 })} />
                <Slider label="Escala %" min={20} max={300} value={Math.round(k.scale * 100)} onChange={(v) => updateLayerKeyframe(layer, i, { scale: v / 100 })} />
                <Slider label="Opacidade %" min={0} max={100} value={Math.round(k.opacity * 100)} onChange={(v) => updateLayerKeyframe(layer, i, { opacity: v / 100 })} />
                <Slider label="Rotação °" min={-180} max={180} value={Math.round(k.rotation)} onChange={(v) => updateLayerKeyframe(layer, i, { rotation: v })} />
                <Select label="Suavização" value={k.ease} onChange={(e) => updateLayerKeyframe(layer, i, { ease: e.target.value as EaseId })}>
                  {EASES.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </Select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
