"use client";

// Aba "Auto": ferramentas automáticas / de processamento — auto-montagem e
// estabilização/enhance — em sub-abas para manter o layout enxuto.

import { useState } from "react";
import { Clapperboard, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MontagePanel } from "./montage-panel";
import { ProcessingPanel } from "./processing-panel";

type AutoTab = "montagem" | "melhorar";

const TABS: { id: AutoTab; label: string; icon: typeof Wand2 }[] = [
  { id: "montagem", label: "Montagem", icon: Clapperboard },
  { id: "melhorar", label: "Melhorar", icon: Wand2 },
];

export function AutoPanel() {
  const [tab, setTab] = useState<AutoTab>("montagem");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Ferramentas automáticas" className="flex gap-1.5">
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
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                active ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "montagem" && <MontagePanel />}
        {tab === "melhorar" && <ProcessingPanel />}
      </div>
    </div>
  );
}
