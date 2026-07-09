"use client";

// Overlays + Picture-in-Picture (CapCut Pro): adiciona camadas de overlay/PiP
// com posição, escala, opacidade e blend mode (mix-blend-mode). Sem mídia real,
// cada camada é um placeholder com gradiente; o blend fica visível no preview.
// INTEGRAÇÃO real: FFmpeg/backend — sobrepor vídeo/imagem com o blend escolhido.

import { Layers, Plus, PictureInPicture2, Trash2 } from "lucide-react";
import { BLEND_MODES, overlaySwatch, type BlendMode, type OverlayKind } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

const KINDS: { id: OverlayKind; label: string; desc: string; icon: typeof Layers }[] = [
  { id: "pip", label: "Picture-in-Picture", desc: "Janela flutuante sobre o vídeo", icon: PictureInPicture2 },
  { id: "overlay", label: "Overlay", desc: "Textura/camada em tela cheia com blend", icon: Layers },
];

export function OverlaysPanel() {
  const { doc, addOverlay, updateOverlay, removeOverlay } = useEditorStore();

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Adicionar camada</h3>
        <div className="grid grid-cols-1 gap-2">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.id}
                onClick={() => addOverlay(k.id)}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-left transition-colors hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <Icon className="h-5 w-5 shrink-0 text-violet-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium text-zinc-100">
                    <Plus className="h-3 w-3 text-violet-400" aria-hidden /> {k.label}
                  </span>
                  <span className="block text-[11px] leading-tight text-zinc-500">{k.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Camadas ({doc.overlays.length})</h3>
        {doc.overlays.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nenhuma camada ainda. Adicione um PiP ou um overlay acima — ele aparece no preview com o blend escolhido.
          </p>
        ) : (
          <ul className="space-y-2">
            {doc.overlays.map((o) => (
              <li key={o.id} className="rounded-xl border border-line bg-surface-2/60 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="h-6 w-6 shrink-0 rounded-md ring-1 ring-inset ring-white/20"
                    style={{ background: overlaySwatch(o.hue) }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-zinc-200">{o.label}</span>
                  <button
                    onClick={() => removeOverlay(o.id)}
                    aria-label={`Remover ${o.label}`}
                    className="ml-auto rounded p-1 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  <Slider label="Posição X" min={0} max={100} value={Math.round(o.x * 100)} onChange={(v) => updateOverlay(o.id, { x: v / 100 })} />
                  <Slider label="Posição Y" min={0} max={100} value={Math.round(o.y * 100)} onChange={(v) => updateOverlay(o.id, { y: v / 100 })} />
                  <Slider label="Escala %" min={20} max={140} value={Math.round(o.scale * 100)} onChange={(v) => updateOverlay(o.id, { scale: v / 100 })} />
                  <Slider label="Opacidade %" min={0} max={100} value={Math.round(o.opacity * 100)} onChange={(v) => updateOverlay(o.id, { opacity: v / 100 })} />
                  <Slider label="Matiz do placeholder" min={0} max={360} value={o.hue} onChange={(v) => updateOverlay(o.id, { hue: v })} />
                </div>

                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] text-zinc-400">Blend mode</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Blend de ${o.label}`}>
                    {BLEND_MODES.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => updateOverlay(o.id, { blend: b.id as BlendMode })}
                        aria-pressed={o.blend === b.id}
                        className={cn(
                          "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                          o.blend === b.id ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                        )}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
