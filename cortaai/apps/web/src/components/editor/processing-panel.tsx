"use client";

// Estabilização + Enhance/Upscale (CapCut Pro): toggles com força (estabilização)
// e alvo de upscale (720→1080→4K), que aparecem nas opções de exportação. Uma
// dica visual "antes/depois" é mostrada no preview quando o enhance está ligado.
// INTEGRAÇÃO real: FFmpeg/backend — vidstab + upscale (Real-ESRGAN/topaz).

import { Sparkles, Video } from "lucide-react";
import { type UpscaleTarget } from "@/lib/edit-visuals";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const TARGETS: { id: UpscaleTarget; label: string; detail: string }[] = [
  { id: "720p", label: "720p", detail: "HD" },
  { id: "1080p", label: "1080p", detail: "Full HD" },
  { id: "4K", label: "4K", detail: "Ultra HD" },
];

export function ProcessingPanel() {
  const { doc, setProcessing } = useEditorStore();
  const p = doc.processing;

  return (
    <div className="space-y-4">
      {/* Estabilização */}
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-violet-400" aria-hidden />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estabilização</h3>
        </div>
        <Switch
          checked={p.stabilize}
          onChange={(v) => setProcessing({ stabilize: v })}
          label="Estabilizar vídeo"
          description="Reduz tremores da câmera"
        />
        {p.stabilize && (
          <Slider
            label={`Força (${p.stabilizeStrength}%)`}
            min={0}
            max={100}
            value={p.stabilizeStrength}
            onChange={(v) => setProcessing({ stabilizeStrength: v })}
          />
        )}
      </section>

      {/* Enhance / Upscale */}
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-400" aria-hidden />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Enhance / Upscale</h3>
        </div>
        <Switch
          checked={p.enhance}
          onChange={(v) => setProcessing({ enhance: v })}
          label="Melhorar qualidade (upscale)"
          description="Aumenta nitidez e resolução no render"
        />
        {p.enhance && (
          <div>
            <p className="mb-1.5 text-[11px] text-zinc-400">Resolução alvo</p>
            <div className="flex gap-1.5" role="group" aria-label="Alvo de upscale">
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setProcessing({ upscaleTarget: t.id })}
                  aria-pressed={p.upscaleTarget === t.id}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    p.upscaleTarget === t.id ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                  )}
                >
                  <span className="block text-xs font-bold">{t.label}</span>
                  <span className="text-[9px] text-zinc-500">{t.detail}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-zinc-500">
        Estabilização e enhance são reprocessados na exportação (aparecem nas opções do render).
        No preview, o enhance mostra uma dica &ldquo;antes/depois&rdquo;.
      </p>
    </div>
  );
}
