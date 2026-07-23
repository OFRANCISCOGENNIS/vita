"use client";

// Texto animado (CapCut Pro): templates de texto com animações de entrada/saída
// (typewriter, pop, slide, bounce, glow, wave). O preset é aplicado a um título
// no preview, que anima ao vivo. Valores no EditorDoc (undo/redo).

import { TEXT_ANIM_META, type TextAnimId } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const POSITIONS: { id: "topo" | "centro" | "rodapé"; label: string }[] = [
  { id: "topo", label: "Topo" },
  { id: "centro", label: "Centro" },
  { id: "rodapé", label: "Rodapé" },
];

export function TextAnimPanel() {
  const { doc, setAnimatedText } = useEditorStore();
  const t = doc.animatedText;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <Switch
          checked={t.enabled}
          onChange={(v) => setAnimatedText({ enabled: v })}
          label="Texto animado"
          description="Título com animação de entrada sobre o vídeo"
        />
        {t.enabled && (
          <Input
            label="Texto"
            value={t.text}
            onChange={(e) => setAnimatedText({ text: e.target.value })}
            placeholder="Ex.: VOCÊ PRECISA VER ISSO"
          />
        )}
      </section>

      {t.enabled && (
        <>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Template de animação</h3>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Templates de texto animado">
              {TEXT_ANIM_META.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAnimatedText({ preset: a.id as TextAnimId })}
                  aria-pressed={t.preset === a.id}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    t.preset === a.id ? "border-fuchsia-500/60 bg-fuchsia-500/10" : "border-line bg-surface-2 hover:border-violet-500/40",
                  )}
                  title={a.desc}
                >
                  <span className="text-lg leading-none" aria-hidden>{a.emoji}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-zinc-100">{a.label}</span>
                    <span className="block text-[10px] leading-tight text-zinc-500">{a.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="at-color" className="text-sm font-medium text-zinc-200">Cor</label>
              <input
                id="at-color"
                type="color"
                value={t.color}
                onChange={(e) => setAnimatedText({ color: e.target.value })}
                className="h-8 w-14 cursor-pointer rounded-lg border border-line bg-surface-2"
                aria-label="Cor do texto"
              />
            </div>
            <Slider label="Tamanho" min={20} max={90} value={t.sizePx} onChange={(v) => setAnimatedText({ sizePx: v })} />
            <div>
              <p className="mb-1.5 text-[11px] text-zinc-400">Posição</p>
              <div className="flex gap-1.5" role="group" aria-label="Posição do texto">
                {POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAnimatedText({ position: p.id })}
                    aria-pressed={t.position === p.id}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                      t.position === p.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <Switch
              checked={t.loop}
              onChange={(v) => setAnimatedText({ loop: v })}
              label="Repetir animação"
              description="Reproduz o efeito em loop no preview"
            />
          </section>
        </>
      )}
    </div>
  );
}
