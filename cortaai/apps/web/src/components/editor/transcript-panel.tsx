"use client";

// Text-based editing: deleting a sentence marks the corresponding segment as
// removed on the timeline (and restores it on undo/click).

import { useMemo } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { groupSentences } from "./sentences";

export function TranscriptPanel() {
  const { cut, doc, toggleSentenceRemoved, seek } = useEditorStore();
  const sentences = useMemo(() => (cut ? groupSentences(cut) : []), [cut]);

  if (!cut) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500">
        Edite o vídeo pelo texto: excluir uma frase remove o trecho correspondente da timeline.
        Clique no horário para levar o playhead até a frase.
      </p>
      <ul className="space-y-2">
        {sentences.map((s) => {
          const removed = doc.removedSentenceKeys.includes(s.key);
          return (
            <li
              key={s.key}
              className={cn(
                "group rounded-xl border p-3 transition-colors",
                removed ? "border-rose-500/30 bg-rose-500/5" : "border-line bg-surface-2/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  className="shrink-0 rounded font-mono text-[10px] text-violet-400 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  onClick={() => seek(Math.max(0, s.start - cut.startSeconds))}
                  aria-label={`Ir para ${formatDuration(s.start - cut.startSeconds)}`}
                >
                  {formatDuration(Math.max(0, s.start - cut.startSeconds))}
                </button>
                <button
                  onClick={() => toggleSentenceRemoved(s.key)}
                  aria-label={removed ? "Restaurar frase" : "Excluir frase (remove o trecho do vídeo)"}
                  title={removed ? "Restaurar frase" : "Excluir frase"}
                  className={cn(
                    "rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    removed ? "text-emerald-400 hover:bg-emerald-500/10" : "text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400",
                  )}
                >
                  {removed ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className={cn("mt-1 text-sm leading-relaxed", removed ? "text-zinc-600 line-through" : "text-zinc-200")}>
                {s.text}
              </p>
              <p className="mt-1 text-[10px] text-zinc-600">
                {s.words[0]?.speaker} · {formatDuration(s.end - s.start)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
