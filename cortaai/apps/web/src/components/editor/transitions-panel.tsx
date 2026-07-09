"use client";

// Transições entre cortes: pick a transition per split boundary and preview it.
// Boundaries come from the timeline splits (press S / scissors to create them).

import { useState } from "react";
import { Play, Scissors, Trash2 } from "lucide-react";
import { TRANSITION_META, type TransitionType } from "@/lib/edit-visuals";
import { cn, formatDuration } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";

export function TransitionsPanel() {
  const { cut, doc, splitAtPlayhead, setTransition, removeTransition } = useEditorStore();
  const [previewType, setPreviewType] = useState<TransitionType>("fade");
  const [previewKey, setPreviewKey] = useState(0);

  if (!cut) return null;
  const boundaries = doc.splits;

  function transitionAt(t: number): TransitionType | null {
    return doc.transitions.find((tr) => tr.at === t)?.type ?? null;
  }

  return (
    <div className="space-y-6">
      {/* Preview box */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Prévia da transição</h3>
        <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-800/70 to-fuchsia-900/60" />
          <div
            key={previewKey}
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-sky-700/80 to-emerald-800/70 text-sm font-bold text-white",
              previewKey > 0 && `transi-${previewType}`,
            )}
          >
            Cena B
          </div>
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">Cena A → B</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Tipo de transição para prévia">
          {TRANSITION_META.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setPreviewType(t.id);
                setPreviewKey((k) => k + 1);
              }}
              aria-pressed={previewType === t.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                previewType === t.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
              )}
            >
              <span aria-hidden>{t.emoji}</span> {t.label}
            </button>
          ))}
          <button
            onClick={() => setPreviewKey((k) => k + 1)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Play className="h-3 w-3" aria-hidden /> Reproduzir
          </button>
        </div>
      </section>

      {/* Per-boundary assignment */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cortes ({boundaries.length})</h3>
          <button
            onClick={splitAtPlayhead}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-zinc-400 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Scissors className="h-3 w-3" aria-hidden /> Dividir no playhead
          </button>
        </div>
        {boundaries.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nenhum corte ainda. Divida o clipe (tecla S ou a tesoura) para criar limites onde aplicar transições.
          </p>
        ) : (
          <ul className="space-y-2">
            {boundaries.map((b) => {
              const active = transitionAt(b);
              return (
                <li key={b} className="rounded-xl border border-line bg-surface-2/60 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-xs text-amber-300">✂ {formatDuration(b)}</span>
                    {active && (
                      <button
                        onClick={() => removeTransition(b)}
                        aria-label={`Remover transição em ${formatDuration(b)}`}
                        className="ml-auto rounded p-0.5 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Transição em ${formatDuration(b)}`}>
                    {TRANSITION_META.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTransition(b, t.id);
                          setPreviewType(t.id);
                          setPreviewKey((k) => k + 1);
                        }}
                        aria-pressed={active === t.id}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                          active === t.id ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                        )}
                      >
                        <span aria-hidden>{t.emoji}</span> {t.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
