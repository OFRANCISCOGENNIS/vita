"use client";

// Container for the advanced VIDEO effects, grouped under sub-tabs so the side
// panel stays tidy. Each sub-panel writes into the undoable edit state.

import { useState } from "react";
import { Contrast, Gauge, Crop, Wand2, SquareDashedMousePointer, Shuffle, Sparkles, Palette, Layers as LayersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorPanel } from "./color-panel";
import { FxPanel } from "./fx-panel";
import { FiltersPanel } from "./filters-panel";
import { AdjustmentPanel } from "./adjustment-panel";
import { SpeedPanel } from "./speed-panel";
import { ReframePanel } from "./reframe-panel";
import { ChromaPanel } from "./chroma-panel";
import { MasksPanel } from "./masks-panel";
import { TransitionsPanel } from "./transitions-panel";

type EffectTab = "cor" | "fx" | "filtros" | "ajuste" | "velocidade" | "reenquadrar" | "chroma" | "mascaras" | "transicoes";

const TABS: { id: EffectTab; label: string; icon: typeof Contrast }[] = [
  { id: "fx", label: "Efeitos", icon: Sparkles },
  { id: "filtros", label: "Filtros", icon: Palette },
  { id: "cor", label: "Cor", icon: Contrast },
  { id: "ajuste", label: "Ajuste", icon: LayersIcon },
  { id: "velocidade", label: "Velocidade", icon: Gauge },
  { id: "reenquadrar", label: "Reenquadrar", icon: Crop },
  { id: "chroma", label: "Chroma", icon: Wand2 },
  { id: "mascaras", label: "Máscaras", icon: SquareDashedMousePointer },
  { id: "transicoes", label: "Transições", icon: Shuffle },
];

export function EffectsPanel() {
  const [tab, setTab] = useState<EffectTab>("cor");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Efeitos de vídeo" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                active ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "fx" && <FxPanel />}
        {tab === "filtros" && <FiltersPanel />}
        {tab === "cor" && <ColorPanel />}
        {tab === "ajuste" && <AdjustmentPanel />}
        {tab === "velocidade" && <SpeedPanel />}
        {tab === "reenquadrar" && <ReframePanel />}
        {tab === "chroma" && <ChromaPanel />}
        {tab === "mascaras" && <MasksPanel />}
        {tab === "transicoes" && <TransitionsPanel />}
      </div>
    </div>
  );
}
