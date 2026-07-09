"use client";

// Máscaras / regiões: blur, pixelate (censura), spotlight, basic shapes. Each
// region is draggable/resizable on the preview (overlayMode "masks").

import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MASK_META, type MaskKind, type MaskShape } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

const SHAPES: { id: MaskShape; label: string }[] = [
  { id: "rect", label: "Retângulo" },
  { id: "ellipse", label: "Elipse" },
];

export function MasksPanel() {
  const { doc, selectedMaskId, addMask, updateMask, removeMask, setOverlayMode, setSelectedMaskId } = useEditorStore();

  // Enable editable region handles on the preview while this panel is mounted.
  useEffect(() => {
    setOverlayMode("masks");
    return () => setOverlayMode("none");
  }, [setOverlayMode]);

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Adicionar região</h3>
        <div className="grid grid-cols-2 gap-2">
          {MASK_META.map((m) => (
            <button
              key={m.id}
              onClick={() => addMask(m.id as MaskKind)}
              className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-2.5 text-left transition-colors hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <span className="text-lg" aria-hidden>{m.emoji}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-xs font-medium text-zinc-200">
                  <Plus className="h-3 w-3 text-violet-400" aria-hidden /> {m.label}
                </span>
                <span className="block text-[10px] leading-tight text-zinc-500">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Regiões ({doc.masks.length})</h3>
        {doc.masks.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma região. Adicione uma acima e arraste-a no preview.</p>
        ) : (
          <ul className="space-y-2">
            {doc.masks.map((m) => {
              const meta = MASK_META.find((x) => x.id === m.kind);
              const selected = selectedMaskId === m.id;
              return (
                <li
                  key={m.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    selected ? "border-cyan-400/60 bg-cyan-500/5" : "border-line bg-surface-2/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedMaskId(selected ? null : m.id)}
                      className="flex flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      aria-pressed={selected}
                    >
                      <span className="text-base" aria-hidden>{meta?.emoji}</span>
                      <span className="text-sm font-medium text-zinc-200">{meta?.label}</span>
                    </button>
                    <button
                      onClick={() => removeMask(m.id)}
                      aria-label="Remover região"
                      className="rounded p-1 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {selected && (
                    <div className="mt-3 space-y-3">
                      <div className="flex gap-1.5" role="group" aria-label="Forma da região">
                        {SHAPES.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => updateMask(m.id, { shape: s.id })}
                            aria-pressed={m.shape === s.id}
                            className={cn(
                              "flex-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                              m.shape === s.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <Slider
                        label={m.kind === "spotlight" ? "Escurecimento" : m.kind === "shape" ? "Opacidade" : "Intensidade"}
                        min={10}
                        max={100}
                        value={m.intensity}
                        onChange={(v) => updateMask(m.id, { intensity: v })}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
