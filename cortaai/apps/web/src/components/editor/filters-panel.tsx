"use client";

// Filtros (CapCut Pro): galeria de looks estilizados mais fortes que a paleta de
// correção de cor. Miniaturas com o filtro aplicado a uma amostra + 1 clique.
// Guardado no EditorDoc (undo/redo) e refletido no preview via filtro CSS.

import { RotateCcw } from "lucide-react";
import { FILTER_META, filterCss, type FilterId } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";

// Amostra reutilizada nas miniaturas para mostrar o efeito do filtro.
const SAMPLE = "linear-gradient(135deg, #6d28d9 0%, #db2777 45%, #f59e0b 100%)";

export function FiltersPanel() {
  const { doc, applyFilter, setFilter } = useEditorStore();
  const current = doc.filter;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtros (1 clique)</h3>
        {current.id && (
          <button
            onClick={() => applyFilter(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-zinc-400 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <RotateCcw className="h-3 w-3" aria-hidden /> Nenhum
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Filtros estilizados">
        {FILTER_META.map((f) => {
          const css = filterCss(f.id, current.id === f.id ? current.intensity : 80);
          const active = current.id === f.id;
          return (
            <button
              key={f.id}
              onClick={() => applyFilter(active ? null : (f.id as FilterId))}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                active ? "border-fuchsia-500/70 bg-fuchsia-500/10" : "border-line bg-surface-2 hover:border-violet-500/40",
              )}
              title={f.label}
            >
              <span className="relative block h-12 w-full overflow-hidden rounded-lg" aria-hidden>
                <span className="absolute inset-0" style={{ background: SAMPLE, filter: css?.filter }} />
                {css?.overlay && (
                  <span
                    className="absolute inset-0"
                    style={{ backgroundColor: css.overlay.color, opacity: css.overlay.opacity, mixBlendMode: css.overlay.blend as React.CSSProperties["mixBlendMode"] }}
                  />
                )}
                <span className="absolute bottom-0.5 right-0.5 text-[10px]">{f.emoji}</span>
              </span>
              <span className="text-[10px] font-medium leading-tight text-zinc-300">{f.label}</span>
            </button>
          );
        })}
      </div>

      {current.id && (
        <section className="space-y-2 rounded-xl border border-line bg-surface-2/50 p-4">
          <Slider
            label="Intensidade do filtro"
            min={0}
            max={100}
            value={current.intensity}
            onChange={(v) => setFilter({ intensity: v })}
          />
          <p className="text-[11px] text-zinc-500">
            O filtro é combinado com a correção de cor e aplicado ao preview em tempo real.
          </p>
        </section>
      )}
    </div>
  );
}
