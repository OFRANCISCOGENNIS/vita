"use client";

// Layers panel: headline, watermark, progress bar, stickers, auto zoom-punch,
// transitions.

import { useEditorStore } from "@/store/editor";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KeyframesPanel } from "./keyframes-panel";

const TRANSITIONS = ["nenhuma", "corte seco", "zoom", "slide"] as const;

export function LayersPanel() {
  const { doc, apply } = useEditorStore();
  const layers = doc.layers;

  function setLayers(patch: Partial<typeof layers>) {
    apply({ layers: { ...layers, ...patch } });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <Switch
          checked={layers.headlineEnabled}
          onChange={(v) => setLayers({ headlineEnabled: v })}
          label="Headline (título no vídeo)"
          description="Frase fixa no topo do corte"
        />
        {layers.headlineEnabled && (
          <Input
            label="Texto da headline"
            value={layers.headlineText}
            onChange={(e) => setLayers({ headlineText: e.target.value })}
            placeholder="Ex.: Ele recusou R$2 milhões"
          />
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <Switch
          checked={layers.watermarkEnabled}
          onChange={(v) => setLayers({ watermarkEnabled: v })}
          label="Logo / marca d'água"
          description="Usa o logo do seu Kit de marca"
        />
        <Switch
          checked={layers.progressBarEnabled}
          onChange={(v) => setLayers({ progressBarEnabled: v })}
          label="Barra de progresso"
          description="Barra animada no rodapé — aumenta retenção"
        />
        <Switch
          checked={layers.stickersEnabled}
          onChange={(v) => setLayers({ stickersEnabled: v })}
          label="Stickers / emoji"
          description="Reações automáticas em momentos de pico"
        />
        <Switch
          checked={layers.autoZoomPunch}
          onChange={(v) => setLayers({ autoZoomPunch: v })}
          label="Zoom-punch automático"
          description="Zoom sutil nos picos de ênfase da fala"
        />
      </section>

      <Select
        label="Transição entre segmentos"
        value={layers.transition}
        onChange={(e) => apply({ layers: { ...layers, transition: e.target.value as typeof layers.transition } })}
      >
        {TRANSITIONS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </Select>
      <KeyframesPanel />

      <p className="text-xs leading-relaxed text-zinc-500">
        As camadas seguem as zonas seguras do preset de plataforma selecionado no preview.
      </p>
    </div>
  );
}
