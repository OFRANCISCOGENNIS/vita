"use client";

// Captions panel: 8 presets with live styled preview + fine-grained style
// controls (font/color/outline/shadow/position/animation/keyword/censor).

import { CAPTION_PRESETS } from "@/lib/presets";
import type { CaptionPresetId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Select } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const FONTS = ["Inter", "Arial Black", "Georgia", "Impact", "Verdana", "Courier New"];
const POSITIONS = ["topo", "centro", "rodapé"] as const;
const ANIMATIONS = ["nenhuma", "pop", "slide", "karaokê"] as const;

export function CaptionsPanel() {
  const { doc, apply } = useEditorStore();
  const style = doc.captionStyle;

  function setStyle(patch: Partial<typeof style>) {
    apply({ captionStyle: { ...style, ...patch } });
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Preset de legenda
        </h3>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Escolher preset de legenda">
          {CAPTION_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => apply({ captionPreset: p.id as CaptionPresetId })}
              aria-pressed={doc.captionPreset === p.id}
              title={p.description}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                doc.captionPreset === p.id
                  ? "border-violet-500/60 bg-violet-500/10"
                  : "border-line bg-surface-2 hover:border-violet-500/40",
              )}
            >
              <span
                className={cn(
                  "block max-w-full truncate text-[13px]",
                  p.previewClass,
                  p.id === "gradientAnimated" && "caption-gradient-animated",
                )}
              >
                {p.sample}
              </span>
              <span className="text-[10px] font-medium text-zinc-400">{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estilo</h3>
        <Select label="Fonte" value={style.font} onChange={(e) => setStyle({ font: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </Select>
        <div>
          <label htmlFor="caption-color" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Cor principal
          </label>
          <div className="flex items-center gap-2">
            <input
              id="caption-color"
              type="color"
              value={style.color}
              onChange={(e) => setStyle({ color: e.target.value })}
              className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface-2"
              aria-label="Cor da legenda"
            />
            <span className="font-mono text-xs text-zinc-500">{style.color}</span>
          </div>
        </div>
        <Slider label="Tamanho (px em 1080×1920)" min={18} max={72} value={style.sizePx} onChange={(v) => setStyle({ sizePx: v })} />
        <Select label="Posição" value={style.position} onChange={(e) => setStyle({ position: e.target.value as typeof style.position })}>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        <Select label="Animação de entrada" value={style.animation} onChange={(e) => setStyle({ animation: e.target.value as typeof style.animation })}>
          {ANIMATIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <div className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
          <Switch checked={style.outline} onChange={(v) => setStyle({ outline: v })} label="Contorno" description="Borda preta ao redor das letras" />
          <Switch checked={style.shadow} onChange={(v) => setStyle({ shadow: v })} label="Sombra" description="Sombra projetada para legibilidade" />
          <Switch
            checked={style.highlightKeywords}
            onChange={(v) => setStyle({ highlightKeywords: v })}
            label="Destacar palavras-chave"
            description="Destaca automaticamente números e termos fortes"
          />
          <Switch
            checked={style.censorProfanity}
            onChange={(v) => setStyle({ censorProfanity: v })}
            label="Censurar palavrões"
            description="Substitui palavrões por **** na legenda e bipa o áudio"
          />
        </div>
      </section>
    </div>
  );
}
