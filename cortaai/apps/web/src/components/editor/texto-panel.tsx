"use client";

// Aba "Texto": agrupa o texto animado (templates in/out) e a edição por
// transcrição (excluir frases remove trechos), em sub-abas para não sobrecarregar.

import { useState } from "react";
import { Type, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextAnimPanel } from "./text-anim-panel";
import { TranscriptPanel } from "./transcript-panel";

type TextTab = "animado" | "transcricao";

const TABS: { id: TextTab; label: string; icon: typeof Type }[] = [
  { id: "animado", label: "Animado", icon: Type },
  { id: "transcricao", label: "Transcrição", icon: FileText },
];

export function TextoPanel() {
  const [tab, setTab] = useState<TextTab>("animado");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Ferramentas de texto" className="flex gap-1.5">
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
        {tab === "animado" && <TextAnimPanel />}
        {tab === "transcricao" && <TranscriptPanel />}
      </div>
    </div>
  );
}
