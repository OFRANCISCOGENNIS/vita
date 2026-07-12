"use client";

// Camada de ajuste (CapCut Pro): um ajuste global de cor/FX aplicado sobre toda
// a composição (mídia + camadas), ligável. Guardado no EditorDoc (undo/redo);
// aplicado no preview como filtro CSS sobre a base + tint opcional do filtro.

import { FILTER_META, type FilterId } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const CONTROLS: { key: "brightness" | "contrast" | "saturation" | "vibrance"; label: string }[] = [
  { key: "brightness", label: "Brilho" },
  { key: "contrast", label: "Contraste" },
  { key: "saturation", label: "Saturação" },
  { key: "vibrance", label: "Vibração" },
];

export function AdjustmentPanel() {
  const { doc, setAdjustment } = useEditorStore();
  const adj = doc.adjustment;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <Switch
          checked={adj.enabled}
          onChange={(v) => setAdjustment({ enabled: v })}
          label="Camada de ajuste"
          description="Aplica cor/FX por cima de toda a composição"
        />
      </section>

      {adj.enabled ? (
        <>
          <section className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4">
            {CONTROLS.map((c) => (
              <Slider
                key={c.key}
                label={c.label}
                min={-100}
                max={100}
                value={adj[c.key]}
                onChange={(v) => setAdjustment({ [c.key]: v })}
              />
            ))}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtro do ajuste</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro da camada de ajuste">
              <button
                onClick={() => setAdjustment({ filter: null })}
                aria-pressed={adj.filter === null}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  adj.filter === null ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                )}
              >
                Nenhum
              </button>
              {FILTER_META.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setAdjustment({ filter: adj.filter === f.id ? null : (f.id as FilterId) })}
                  aria-pressed={adj.filter === f.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    adj.filter === f.id ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                  )}
                >
                  <span aria-hidden>{f.emoji}</span> {f.label}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-zinc-500">
          Ative a camada de ajuste para aplicar um look global sem alterar cada camada individualmente.
          Ideal para unificar a estética do corte inteiro.
        </p>
      )}
    </div>
  );
}
