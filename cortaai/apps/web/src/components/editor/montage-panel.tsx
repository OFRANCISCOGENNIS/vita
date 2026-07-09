"use client";

// Auto-montagem / slideshow (CapCut Pro): monta uma sequência de N imagens
// (stills simuladas) com transições sincronizadas ao tempo escolhido, e gera
// uma prévia de timeline. "Gerar montagem" aplica cortes + transições reais na
// timeline do editor (undo/redo). INTEGRAÇÃO real: FFmpeg/backend concatena as
// mídias com as transições no ritmo definido.

import { Clapperboard, Sparkles, Wand2 } from "lucide-react";
import {
  MONTAGE_TEMPO_BPM,
  TRANSITION_META,
  montageSlideDuration,
  type MontageTempo,
  type TransitionType,
} from "@/lib/edit-visuals";
import { cn, formatDuration } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { toast } from "@/store/toast";
import { Slider } from "@/components/ui/slider";

const TEMPOS: MontageTempo[] = ["lento", "médio", "rápido", "batida"];
// Cores para os "stills" simulados da prévia da montagem.
const SLIDE_HUES = [265, 300, 330, 20, 45, 160, 190, 220, 90, 120, 350, 240];

export function MontagePanel() {
  const { cut, doc, setMontage, buildMontage } = useEditorStore();
  const m = doc.montage;
  const duration = cut ? cut.endSeconds - cut.startSeconds : 0;
  const slideDur = montageSlideDuration(m.tempo);
  const meta = TRANSITION_META.find((t) => t.id === m.transition);

  function generate() {
    buildMontage();
    toast("Montagem gerada — cortes e transições aplicados na timeline", { variant: "success" });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-violet-400" aria-hidden />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Auto-montagem / slideshow</h3>
        </div>

        <Slider
          label={`Cenas (${m.slides})`}
          min={3}
          max={12}
          value={m.slides}
          onChange={(v) => setMontage({ slides: v, built: false })}
        />

        <div>
          <p className="mb-1.5 text-[11px] text-zinc-400">Tempo</p>
          <div className="flex gap-1.5" role="group" aria-label="Tempo da montagem">
            {TEMPOS.map((t) => (
              <button
                key={t}
                onClick={() => setMontage({ tempo: t, built: false })}
                aria-pressed={m.tempo === t}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  m.tempo === t ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                )}
              >
                <span className="block text-[11px] font-semibold capitalize">{t}</span>
                <span className="text-[9px] text-zinc-500">{MONTAGE_TEMPO_BPM[t]} BPM</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] text-zinc-400">Transição entre cenas</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Transição da montagem">
            {TRANSITION_META.map((t) => (
              <button
                key={t.id}
                onClick={() => setMontage({ transition: t.id as TransitionType, built: false })}
                aria-pressed={m.transition === t.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  m.transition === t.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                )}
              >
                <span aria-hidden>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Prévia da timeline da montagem */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Prévia da montagem · ~{slideDur.toFixed(1)}s por cena
        </p>
        <div className="flex items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-surface-1 p-2" role="img" aria-label={`Prévia com ${m.slides} cenas`}>
          {Array.from({ length: m.slides }).map((_, i) => (
            <div key={i} className="flex shrink-0 items-center">
              <div
                className="flex h-14 w-16 items-center justify-center rounded-md text-[10px] font-bold text-white/90 ring-1 ring-inset ring-white/15"
                style={{ background: `linear-gradient(135deg, hsl(${SLIDE_HUES[i % SLIDE_HUES.length]},65%,50%), hsl(${SLIDE_HUES[i % SLIDE_HUES.length] + 40},65%,40%))` }}
              >
                {i + 1}
              </div>
              {i < m.slides - 1 && (
                <span className="px-0.5 text-xs" aria-hidden title={meta?.label}>{meta?.emoji}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={generate}
        disabled={!cut || duration <= 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
      >
        <Wand2 className="h-4 w-4" aria-hidden /> Gerar montagem
      </button>

      {m.built && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Montagem aplicada — veja os cortes e transições na timeline.
        </p>
      )}
    </div>
  );
}
