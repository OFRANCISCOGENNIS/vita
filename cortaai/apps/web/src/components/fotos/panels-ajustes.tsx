"use client";

// Ajustes tab — light/color/effect sliders + named user presets (the only
// persisted slice of the photo editor: localStorage "cortaai-photo-presets").

import { useState } from "react";
import { RotateCcw, Save, Trash2, Wand2 } from "lucide-react";
import { toast } from "@/store/toast";
import { usePhotoEditorStore, usePhotoPresetsStore } from "@/store/photo-editor";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Adjustments } from "@/lib/photo-engine";

const GROUPS: { title: string; items: { key: keyof Adjustments; label: string; min?: number }[] }[] = [
  {
    title: "Luz",
    items: [
      { key: "exposure", label: "Exposição" },
      { key: "brightness", label: "Brilho" },
      { key: "contrast", label: "Contraste" },
      { key: "highlights", label: "Realces" },
      { key: "shadows", label: "Sombras" },
    ],
  },
  {
    title: "Cor",
    items: [
      { key: "temperature", label: "Temperatura" },
      { key: "tint", label: "Matiz (verde/magenta)" },
      { key: "saturation", label: "Saturação" },
      { key: "vibrance", label: "Vibração" },
    ],
  },
  {
    title: "Efeitos",
    items: [
      { key: "clarity", label: "Clareza (contraste local)" },
      { key: "sharpen", label: "Nitidez", min: 0 },
      { key: "blur", label: "Desfoque", min: 0 },
      { key: "vignette", label: "Vinheta", min: 0 },
      { key: "grain", label: "Grão", min: 0 },
    ],
  },
];

export function AjustesPanel() {
  const adj = usePhotoEditorStore((s) => s.params.adj);
  const params = usePhotoEditorStore((s) => s.params);
  const setAdj = usePhotoEditorStore((s) => s.setAdj);
  const resetAdjustments = usePhotoEditorStore((s) => s.resetAdjustments);
  const applyPreset = usePhotoEditorStore((s) => s.applyPreset);
  const { presets, hydrated, save, remove } = usePhotoPresetsStore();
  const [presetName, setPresetName] = useState("");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ajustes</h3>
        <Button size="sm" variant="ghost" onClick={resetAdjustments} aria-label="Resetar todos os ajustes de cor">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Resetar tudo
        </Button>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-violet-400/90">{g.title}</h4>
          {g.items.map((it) => (
            <Slider
              key={it.key}
              label={it.label}
              min={it.min ?? -100}
              max={100}
              value={Math.round(adj[it.key])}
              onChange={(v) => setAdj({ [it.key]: v })}
            />
          ))}
        </section>
      ))}

      {/* Presets */}
      <section className="space-y-3 border-t border-line pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-violet-400/90">Meus presets</h4>
        <div className="flex gap-2">
          <Input
            aria-label="Nome do preset"
            placeholder="Nome do preset…"
            value={presetName}
            maxLength={32}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-10 shrink-0"
            disabled={!presetName.trim()}
            onClick={() => {
              save(presetName.trim(), params);
              setPresetName("");
              toast("Preset salvo", { description: "Disponível em qualquer foto, mesmo após recarregar.", variant: "success" });
            }}
          >
            <Save className="h-3.5 w-3.5" aria-hidden /> Salvar
          </Button>
        </div>
        {!hydrated ? (
          <p className="text-xs text-zinc-500">Carregando presets…</p>
        ) : presets.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nenhum preset ainda. Ajuste a foto e salve a receita para reutilizar depois.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {presets.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                <span className="flex-1 truncate text-xs text-zinc-200">{p.name}</span>
                <button
                  onClick={() => {
                    applyPreset(p);
                    toast(`Preset "${p.name}" aplicado`, { variant: "info" });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Wand2 className="h-3 w-3" aria-hidden /> Aplicar
                </button>
                <button
                  onClick={() => remove(p.id)}
                  aria-label={`Excluir preset ${p.name}`}
                  className="rounded p-1 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
