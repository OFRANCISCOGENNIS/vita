"use client";

// Suggested-cut card: magnetic title, viral score with breakdown popover,
// transcript snippet, hashtags, suggested sound, best post time, regenerate.

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, Music2, Pencil, RefreshCw, Share2 } from "lucide-react";
import * as api from "@/lib/api";
import type { Cut } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScoreBadge } from "./score-badge";
import { BreakdownBars } from "./breakdown-bars";
import { ShareModal } from "./share-modal";

const modeLabels: Record<Cut["mode"], string> = {
  viral: "Momentos virais",
  qa: "Perguntas e respostas",
  tutorial: "Tutorial em passos",
  quotes: "Melhores frases",
  manual: "Corte manual",
};

const statusLabels: Record<Cut["status"], { label: string; variant: "default" | "accent" | "info" | "success" }> = {
  suggested: { label: "Sugerido pela IA", variant: "default" },
  edited: { label: "Editado", variant: "accent" },
  rendering: { label: "Renderizando", variant: "info" },
  rendered: { label: "Exportado", variant: "success" },
};

export function CutCard({ cut: initial }: { cut: Cut }) {
  const [cut, setCut] = useState(initial);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const snippet = cut.transcript
    .slice(0, 16)
    .map((w) => w.word)
    .join(" ");

  async function regenerate() {
    setRegenerating(true);
    try {
      const next = await api.regenerateCut(cut.id);
      setCut(next);
      toast("Corte regenerado", {
        description: `Novo score viral: ${next.viralScore}. Título atualizado.`,
      });
    } catch {
      toast("Falha ao regenerar", { description: "Tente novamente.", variant: "error" });
    } finally {
      setRegenerating(false);
    }
  }

  const status = statusLabels[cut.status];

  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface-1 p-5 shadow-card transition-colors hover:border-violet-500/30">
      <div className="flex items-start justify-between gap-3">
        <div className="relative">
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            aria-expanded={showBreakdown}
            aria-label={`Score viral ${cut.viralScore} — ver detalhamento`}
            className="flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <ScoreBadge score={cut.viralScore} size="lg" label="Score viral" />
            <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", showBreakdown && "rotate-180")} aria-hidden />
          </button>
          {showBreakdown && (
            <div className="absolute left-0 top-11 z-20 w-64 rounded-xl border border-line bg-surface-2 p-4 shadow-2xl animate-fade-up">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Detalhamento do score
              </p>
              <BreakdownBars
                breakdown={[
                  { label: "Gancho", value: cut.scoreBreakdown.hook },
                  { label: "Retenção", value: cut.scoreBreakdown.retention },
                  { label: "Emoção", value: cut.scoreBreakdown.emotion },
                  { label: "Aderência ao nicho", value: cut.scoreBreakdown.nicheFit },
                ]}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className="text-xs text-zinc-500">
            {formatDuration(cut.endSeconds - cut.startSeconds)} · {modeLabels[cut.mode]}
          </span>
        </div>
      </div>

      <h3 className="mt-3 text-base font-bold leading-snug text-white">{cut.title}</h3>
      <p className="mt-2 line-clamp-2 text-xs italic leading-relaxed text-zinc-500">&ldquo;{snippet}...&rdquo;</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {cut.hashtags.map((h) => (
          <span key={h} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-violet-300">
            {h}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-surface-2/60 p-3 text-xs">
        <p className="flex items-center gap-2 text-zinc-300">
          <Music2 className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" aria-hidden />
          <span className="truncate" title={cut.suggestedSound.reason}>
            {cut.suggestedSound.track}
            <span className="text-zinc-500"> — {cut.suggestedSound.reason}</span>
          </span>
        </p>
        <p className="flex items-center gap-2 text-zinc-300">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
          Melhor horário para postar: <strong className="text-white">{cut.bestPostTime}</strong>
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/app/editor/${cut.id}`}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 text-xs font-medium text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar no estúdio
        </Link>
        <Button size="sm" variant="secondary" onClick={regenerate} loading={regenerating} aria-label="Regenerar corte">
          {!regenerating && <RefreshCw className="h-3.5 w-3.5" aria-hidden />} Regenerar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)} aria-label="Compartilhar corte" title="Compartilhar">
          <Share2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} cut={cut} />
    </article>
  );
}
