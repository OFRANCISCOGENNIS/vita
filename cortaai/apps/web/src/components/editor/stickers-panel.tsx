"use client";

// Stickers / emoji com tracking (CapCut Pro): biblioteca de emoji/stickers +
// "seguir movimento", que faz o sticker percorrer um caminho ao longo do tempo.
// O preview mostra o sticker se movendo (caminho senoidal determinístico).
// INTEGRAÇÃO real: FFmpeg/backend — tracking real acompanha um objeto detectado.

import { MousePointerClick, Trash2 } from "lucide-react";
import { STICKER_LIBRARY } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

export function StickersPanel() {
  const { doc, addSticker, updateSticker, removeSticker } = useEditorStore();

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stickers / emoji</h3>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Biblioteca de stickers">
        {STICKER_LIBRARY.map((e) => (
          <button
            key={e}
            onClick={() => addSticker(e)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-1 text-lg transition-colors hover:border-violet-500/50 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            aria-label={`Adicionar sticker ${e}`}
            title={`Adicionar ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      {doc.stickers.length === 0 ? (
        <p className="text-[11px] text-zinc-500">Toque em um emoji acima para adicioná-lo ao vídeo.</p>
      ) : (
        <ul className="space-y-2">
          {doc.stickers.map((s) => (
            <li key={s.id} className="rounded-lg border border-line bg-surface-1/60 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xl" aria-hidden>{s.content}</span>
                {s.tracking && (
                  <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                    <MousePointerClick className="h-3 w-3" aria-hidden /> seguindo
                  </span>
                )}
                <button
                  onClick={() => removeSticker(s.id)}
                  aria-label={`Remover sticker ${s.content}`}
                  className="ml-auto rounded p-1 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <Slider label="Posição X" min={0} max={100} value={Math.round(s.x * 100)} onChange={(v) => updateSticker(s.id, { x: v / 100 })} />
                <Slider label="Posição Y" min={0} max={100} value={Math.round(s.y * 100)} onChange={(v) => updateSticker(s.id, { y: v / 100 })} />
                <Slider label="Tamanho %" min={40} max={300} value={Math.round(s.scale * 100)} onChange={(v) => updateSticker(s.id, { scale: v / 100 })} />
                <Switch
                  checked={s.tracking}
                  onChange={(v) => updateSticker(s.id, { tracking: v })}
                  label="Seguir movimento"
                  description="Anima o sticker por um caminho ao longo do tempo"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
