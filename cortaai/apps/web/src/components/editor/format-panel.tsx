"use client";

// Painel "Formato" (mobile): proporção + preset de plataforma. No desktop esses
// controles vivem como chips flutuantes sobre o preview; no mobile eles saem de
// cima do vídeo e viram esta aba da barra inferior de ferramentas.

import { PLATFORM_PRESETS } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { useEditorStore, type PlatformPresetId } from "@/store/editor";
import { ASPECTS } from "./preview";

export function FormatPanel() {
  const { doc, apply } = useEditorStore();

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400">Proporção</p>
        <div role="group" aria-label="Proporção do vídeo" className="grid grid-cols-4 gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => apply({ aspect: a.id })}
              aria-pressed={doc.aspect === a.id}
              className={cn(
                "rounded-lg px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                doc.aspect === a.id
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                  : "border border-line text-zinc-400 hover:text-white",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400">Plataforma (safe zones)</p>
        <div role="group" aria-label="Preset de plataforma" className="grid grid-cols-3 gap-2">
          {PLATFORM_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() =>
                apply({
                  platformPreset: doc.platformPreset === p.id ? null : (p.id as PlatformPresetId),
                  aspect: "9:16",
                })
              }
              aria-pressed={doc.platformPreset === p.id}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                doc.platformPreset === p.id
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                  : "border border-line text-zinc-400 hover:text-white",
              )}
            >
              {p.name}
              <span className={cn("text-[10px] font-normal", doc.platformPreset === p.id ? "text-white/70" : "text-zinc-500")}>
                {p.resolution}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Escolher uma plataforma ativa as guias de zona segura no preview e fixa a proporção em 9:16.
        </p>
      </div>
    </div>
  );
}
