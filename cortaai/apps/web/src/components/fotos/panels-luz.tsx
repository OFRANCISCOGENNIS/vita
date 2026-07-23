"use client";

// LUZ — presets de iluminação estilo Facetune (Hora Dourada, Manhã, Drama…)
// com AJUSTE DE INTENSIDADE em tempo real. Relighting SIMULADO com filtro de
// cor + brilhos radiais + vinheta — honesto, 100% no navegador.
//
// Qualidade: guardamos um CLONE full-res da base pré-iluminação; o slider
// re-renderiza a partir dele (sem passar pelo undo, cujos snapshots são
// reduzidos a ~2MP). Uma iluminação = UMA entrada no histórico.

import { useRef, useState } from "react";
import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { applyLightingCanvas, cloneCanvas, LIGHTING_PRESETS } from "@/lib/photo-engine";
import { getBaseCanvas, usePhotoEditorStore } from "@/store/photo-editor";
import { Slider } from "@/components/ui/slider";

const EMOJI: Record<string, string> = {
  "hora-dourada": "🌇",
  manha: "🌤️",
  drama: "🎭",
  "meio-dia": "☀️",
  entardecer: "🌆",
  "neon-noite": "🌃",
};

export function LuzPanel() {
  const busy = usePhotoEditorStore((s) => s.busy);
  const applyPixelOp = usePhotoEditorStore((s) => s.applyPixelOp);
  const notePixelsChanged = usePhotoEditorStore((s) => s.notePixelsChanged);
  const setBusy = usePhotoEditorStore((s) => s.setBusy);
  const version = usePhotoEditorStore((s) => s.version);

  const [intensity, setIntensity] = useState(80);
  const [activeId, setActiveId] = useState<string | null>(null);
  // clone full-res da base ANTES da iluminação + versão do doc após aplicarmos
  const baselineRef = useRef<HTMLCanvasElement | null>(null);
  const appliedAtVersion = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // enquanto ninguém mais mexeu na imagem, o slider re-renderiza ao vivo
  const live = activeId != null && appliedAtVersion.current === version && baselineRef.current != null;

  /** Redesenha a base a partir do clone pré-iluminação (sem nova entrada no histórico). */
  function rerender(presetId: string, value: number) {
    const base = getBaseCanvas();
    const baseline = baselineRef.current;
    if (!base || !baseline || base.width !== baseline.width || base.height !== baseline.height) return;
    const lit = applyLightingCanvas(baseline, presetId, value);
    const ctx = base.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, base.width, base.height);
    ctx.drawImage(lit, 0, 0);
    notePixelsChanged();
    appliedAtVersion.current = usePhotoEditorStore.getState().version;
  }

  function pickPreset(presetId: string) {
    if (busy) return;
    const preset = LIGHTING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    if (live) {
      // já estamos numa sessão de iluminação: só troca o preset (mesma entrada no histórico)
      rerender(presetId, intensity);
      setActiveId(presetId);
      return;
    }

    // nova sessão: clona a base atual (full-res) e cria UMA entrada no histórico
    const base = getBaseCanvas();
    if (!base) return;
    const baseline = cloneCanvas(base);
    setBusy(`Aplicando luz "${preset.name}"…`);
    setTimeout(() => {
      try {
        applyPixelOp((b) => applyLightingCanvas(b, presetId, intensity));
        baselineRef.current = baseline;
        setActiveId(presetId);
        appliedAtVersion.current = usePhotoEditorStore.getState().version;
        toast(`Luz "${preset.name}" aplicada`, { description: "Dosar no controle de intensidade abaixo.", variant: "success" });
      } finally {
        setBusy(null);
      }
    }, 30);
  }

  function changeIntensity(value: number) {
    setIntensity(value);
    if (!live || !activeId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const id = activeId;
    debounceRef.current = setTimeout(() => rerender(id, value), 120);
  }

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Sun className="h-3.5 w-3.5" aria-hidden /> Luz
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {LIGHTING_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => pickPreset(p.id)}
            disabled={!!busy}
            aria-pressed={live && activeId === p.id}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all hover:bg-white/[0.04] active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              live && activeId === p.id
                ? "border-violet-400 bg-violet-500/15 shadow-[0_0_20px_-6px_rgba(139,92,246,0.5)]"
                : "border-line bg-surface-1 hover:border-violet-500/50",
            )}
          >
            <span className="text-lg" aria-hidden>
              {EMOJI[p.id] ?? "💡"}
            </span>
            <span className="text-[11px] font-medium leading-tight text-zinc-200">{p.name}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface-2/60 p-3">
        <Slider label="Intensidade da iluminação" min={0} max={100} value={intensity} onChange={changeIntensity} />
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          {live
            ? "Arraste para dosar o efeito — a foto atualiza em tempo real. Trocar de preset mantém a mesma base."
            : "Escolha um preset acima; depois este controle dosa a força dele em tempo real."}
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Iluminação simulada com gradientes e correção de cor — não é relighting por IA. Cada sessão de luz entra
        uma única vez no histórico (Ctrl+Z desfaz tudo de uma vez).
      </p>
    </div>
  );
}
