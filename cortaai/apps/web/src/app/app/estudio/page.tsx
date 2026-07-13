"use client";

// Estúdio de vídeo multitrilha — layout full-bleed estilo CapCut, mobile-first.
// Desktop (lg): coluna de mídia à esquerda + preview, timeline embaixo.
// Mobile: preview dominante, timeline compacta, barra inferior de ferramentas;
// a biblioteca de mídia abre como gaveta inferior.
// (Rota nova e aditiva — o editor atual /app/editor segue intacto.)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, FolderOpen, Music2, Redo2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { makeProject } from "@/lib/video-editor/model";
import { useVideoEditor } from "@/store/video-editor";
import { TimelineTracks } from "@/components/video-editor/TimelineTracks";
import { MediaBin } from "@/components/video-editor/MediaBin";
import { MusicPanel } from "@/components/video-editor/MusicPanel";
import { PreviewStage } from "@/components/video-editor/PreviewStage";

export default function EstudioPage() {
  const loadProject = useVideoEditor((s) => s.loadProject);
  const undo = useVideoEditor((s) => s.undo);
  const redo = useVideoEditor((s) => s.redo);
  const canUndo = useVideoEditor((s) => s.past.length > 0);
  const canRedo = useVideoEditor((s) => s.future.length > 0);
  const sourceCount = useVideoEditor((s) => Object.keys(s.sources).length);
  const seeded = useRef(false);
  const [binOpen, setBinOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    loadProject(makeProject("Meu vídeo", { w: 1080, h: 1920 }, 30));
  }, [loadProject]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface">
      {/* Topo */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-1/60 px-3 py-2">
        <Link
          href="/app"
          title="Sair do estúdio"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Sair</span>
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">Estúdio de vídeo</p>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            aria-label="Desfazer"
            className="rounded-lg p-2 text-zinc-400 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            aria-label="Refazer"
            className="rounded-lg p-2 text-zinc-400 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Área principal: mídia (desktop) + preview */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="hidden shrink-0 space-y-5 overflow-y-auto border-r border-line p-3 lg:block lg:w-[300px]">
          <MediaBin />
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <Music2 className="h-3.5 w-3.5" aria-hidden /> Música
            </p>
            <MusicPanel />
          </div>
        </aside>
        <div className="min-h-0 flex-1 p-2 sm:p-3">
          <PreviewStage />
        </div>
      </div>

      {/* Timeline */}
      <div className="shrink-0 px-2 pb-1 sm:px-3">
        <TimelineTracks />
      </div>

      {/* Barra inferior (mobile) */}
      <nav aria-label="Ferramentas" className="flex shrink-0 items-stretch gap-1 border-t border-line bg-surface-1/95 px-2 pt-1 pb-[calc(0.35rem+env(safe-area-inset-bottom))] lg:hidden">
        <button
          onClick={() => setBinOpen(true)}
          className="flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <FolderOpen className="h-5 w-5" aria-hidden />
          Mídia{sourceCount > 0 ? ` (${sourceCount})` : ""}
        </button>
        <button
          onClick={() => setMusicOpen(true)}
          className="flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Music2 className="h-5 w-5" aria-hidden />
          Música
        </button>
        {/* Próximas ferramentas (cortar, texto…) entram nas próximas fatias */}
      </nav>

      {/* Gaveta de mídia (mobile) */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-line bg-surface-2 shadow-2xl transition-transform duration-300 lg:hidden",
          binOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={{ maxHeight: "70dvh" }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="text-sm font-semibold text-white">Mídia</span>
          <button onClick={() => setBinOpen(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-zinc-500 hover:text-white">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(70dvh-3rem)] overflow-y-auto p-3">
          <MediaBin />
        </div>
      </div>
      {binOpen && <button aria-hidden tabIndex={-1} onClick={() => setBinOpen(false)} className="fixed inset-0 z-30 bg-black/50 lg:hidden" />}

      {/* Gaveta de música (mobile) */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-line bg-surface-2 shadow-2xl transition-transform duration-300 lg:hidden",
          musicOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={{ maxHeight: "70dvh" }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="text-sm font-semibold text-white">Música</span>
          <button onClick={() => setMusicOpen(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-zinc-500 hover:text-white">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(70dvh-3rem)] overflow-y-auto p-3">
          <MusicPanel />
        </div>
      </div>
      {musicOpen && <button aria-hidden tabIndex={-1} onClick={() => setMusicOpen(false)} className="fixed inset-0 z-30 bg-black/50 lg:hidden" />}
    </div>
  );
}
