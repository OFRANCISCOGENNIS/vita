"use client";

// Crop / rotação / flip com keyframes de reenquadramento. Editing this panel
// activates the draggable reframe box on the preview (overlayMode). Keyframes
// animate zoom/pan/rotation over time.

import { useEffect } from "react";
import { Diamond, FlipHorizontal2, FlipVertical2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

export function ReframePanel() {
  const { doc, currentTime, setReframe, addReframeKeyframe, removeReframeKeyframe, setOverlayMode } = useEditorStore();
  const r = doc.reframe;

  // Show the reframe box on the preview while this panel is mounted.
  useEffect(() => {
    setOverlayMode("reframe");
    return () => setOverlayMode("none");
  }, [setOverlayMode]);

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-200">
        Arraste a caixa rosa no preview para reposicionar; use as alças para dar zoom.
        Com o teclado: setas movem, Shift+setas redimensionam.
      </p>

      <section className="space-y-4">
        <Slider label="Zoom" min={1} max={4} step={0.05} value={r.zoom} onChange={(v) => setReframe({ zoom: v })} />
        <Slider label="Deslocamento horizontal" min={-100} max={100} value={Math.round(r.panX * 100)} onChange={(v) => setReframe({ panX: v / 100 })} />
        <Slider label="Deslocamento vertical" min={-100} max={100} value={Math.round(r.panY * 100)} onChange={(v) => setReframe({ panY: v / 100 })} />
        <Slider label="Rotação (°)" min={-180} max={180} value={Math.round(r.rotation)} onChange={(v) => setReframe({ rotation: v })} />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setReframe({ flipH: !r.flipH })}
            aria-pressed={r.flipH}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              r.flipH ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
            )}
          >
            <FlipHorizontal2 className="h-4 w-4" aria-hidden /> Espelhar H
          </button>
          <button
            onClick={() => setReframe({ flipV: !r.flipV })}
            aria-pressed={r.flipV}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              r.flipV ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
            )}
          >
            <FlipVertical2 className="h-4 w-4" aria-hidden /> Espelhar V
          </button>
          <button
            onClick={() => setReframe({ zoom: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-400 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Redefinir
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Keyframes de reenquadramento</h3>
          <button
            onClick={addReframeKeyframe}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Plus className="h-3 w-3" aria-hidden /> Em {formatDuration(currentTime)}
          </button>
        </div>
        {r.keyframes.length === 0 ? (
          <p className="text-xs text-zinc-500">Posicione a caixa, mova o playhead e adicione keyframes para animar um zoom/pan cinematográfico.</p>
        ) : (
          <ul className="space-y-1.5">
            {r.keyframes.map((k) => (
              <li key={k.t} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
                <Diamond className="h-3 w-3 shrink-0 fill-fuchsia-400 text-fuchsia-400" aria-hidden />
                <span className="font-mono text-zinc-300">{formatDuration(k.t)}</span>
                <span className="ml-auto font-mono text-fuchsia-300">{k.zoom.toFixed(2)}x · {Math.round(k.rotation)}°</span>
                <button
                  onClick={() => removeReframeKeyframe(k.t)}
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
