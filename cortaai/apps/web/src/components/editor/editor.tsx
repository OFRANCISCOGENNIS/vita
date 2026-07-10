"use client";

// Professional editor shell: preview + side panels + multi-track timeline,
// keyboard shortcuts, autosave, version history and export modal.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CloudUpload,
  Download,
  History,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  Redo2,
  Share2,
  Undo2,
} from "lucide-react";
import * as api from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { ShareModal } from "@/components/share-modal";
import { EditorPreview } from "./preview";
import { EditorTimeline } from "./timeline";
import { CaptionsPanel } from "./captions-panel";
import { LayersPanel } from "./layers-panel";
import { EffectsPanel } from "./effects-panel";
import { OverlaysPanel } from "./overlays-panel";
import { AudioPanel } from "./audio-panel";
import { TextoPanel } from "./texto-panel";
import { AutoPanel } from "./auto-panel";
import { ExportModal } from "./export-modal";
import { ShortcutsModal } from "./shortcuts-modal";

type PanelTab = "captions" | "effects" | "overlays" | "layers" | "audio" | "texto" | "auto";

export default function Editor({ cutId }: { cutId: string }) {
  const {
    cut,
    doc,
    past,
    future,
    playing,
    currentTime,
    dirty,
    savedAt,
    versions,
    loadCut,
    apply,
    undo,
    redo,
    togglePlay,
    setPlaying,
    seek,
    splitAtPlayhead,
    markSaved,
    restoreVersion,
    revokeMedia,
  } = useEditorStore();

  const [loadError, setLoadError] = useState(false);
  const [panel, setPanel] = useState<PanelTab>("captions");
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    api
      .getCut(cutId)
      .then(loadCut)
      .catch(() => setLoadError(true));
  }, [cutId, loadCut]);

  useEffect(load, [load]);

  const duration = cut ? cut.endSeconds - cut.startSeconds : 0;

  // Playback ticker — drives the playhead for demo/mock cuts (gradient preview).
  // When a real <video> is loaded, the element itself is the clock (it calls
  // seek() via timeupdate), so we skip the synthetic tick to avoid double time.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const s = useEditorStore.getState();
      if (s.mediaUrl) return; // real video drives the playhead
      const max = s.cut ? s.cut.endSeconds - s.cut.startSeconds : 0;
      const next = s.currentTime + 0.1;
      if (next >= max) {
        s.setPlaying(false);
        s.seek(max);
      } else {
        s.seek(next);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [playing]);

  // Autosave (debounced) — PATCH /cuts/{id} with the editor state.
  useEffect(() => {
    if (!dirty || !cut) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await api.patchCut(cut.id, { editState: doc as unknown as Record<string, unknown> });
        markSaved();
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [dirty, doc, cut, markSaved]);

  // Keyboard shortcuts (documented in the "?" modal)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (typing) return;

      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "i") {
        apply({ inPoint: Math.round(useEditorStore.getState().currentTime * 10) / 10 });
        toast("Ponto de entrada marcado", { variant: "info" });
      } else if (e.key.toLowerCase() === "o") {
        apply({ outPoint: Math.round(useEditorStore.getState().currentTime * 10) / 10 });
        toast("Ponto de saída marcado", { variant: "info" });
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
        splitAtPlayhead();
        toast("Clipe dividido no playhead", { variant: "info" });
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        redo();
      } else if (e.key === "?") {
        setShortcutsOpen(true);
      } else if (e.key === "ArrowLeft") {
        seek(useEditorStore.getState().currentTime - (e.shiftKey ? 1 : 0.1));
      } else if (e.key === "ArrowRight") {
        seek(useEditorStore.getState().currentTime + (e.shiftKey ? 1 : 0.1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, redo, seek, splitAtPlayhead, togglePlay, undo]);

  // Pause playback and free the media object URL when leaving the editor.
  useEffect(
    () => () => {
      setPlaying(false);
      revokeMedia();
    },
    [setPlaying, revokeMedia],
  );

  if (loadError) {
    return (
      <div className="p-8">
        <EmptyState
          variant="clapper"
          title="Corte não encontrado"
          description="Ele pode ter sido excluído ou regenerado."
          action={
            <div className="flex gap-2">
              <Button onClick={load}>Tentar novamente</Button>
              <Link href="/app/projetos" className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm text-zinc-300 hover:text-white">
                Voltar aos projetos
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (!cut) {
    return (
      <div className="space-y-4 p-6" role="status" aria-label="Carregando corte">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Editor toolbar */}
      <div className="flex items-center gap-2 border-b border-line bg-surface-1/60 px-4 py-2.5">
        <Link
          href={`/app/projeto?id=${cut.projectId}`}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Voltar</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white" title={cut.title}>{cut.title}</p>
        </div>

        {/* Autosave indicator */}
        <span className="hidden items-center gap-1.5 text-xs text-zinc-500 md:inline-flex" aria-live="polite">
          {saving || dirty ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" aria-hidden /> Salvando...
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              Salvo {savedAt ? `· ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </>
          )}
        </span>

        {/* Version history */}
        <div className="relative">
          <Button variant="ghost" size="sm" onClick={() => setVersionsOpen((v) => !v)} aria-expanded={versionsOpen} aria-label="Histórico de versões">
            <History className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Versões</span>
            <ChevronDown className="h-3 w-3" aria-hidden />
          </Button>
          {versionsOpen && (
            <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-line bg-surface-2 p-2 shadow-2xl animate-fade-up">
              <button
                className="mb-1 flex w-full items-center gap-2 rounded-lg bg-violet-500/10 px-3 py-2 text-left text-xs font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                onClick={() => {
                  markSaved(`Versão manual — ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
                  toast("Versão salva no histórico");
                }}
              >
                <CloudUpload className="h-3.5 w-3.5" aria-hidden /> Salvar versão atual
              </button>
              <ul className="max-h-56 space-y-0.5 overflow-y-auto">
                {versions.map((v, i) => (
                  <li key={i}>
                    <button
                      className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      onClick={() => {
                        restoreVersion(i);
                        setVersionsOpen(false);
                        toast("Versão restaurada", { description: v.label, variant: "info" });
                      }}
                    >
                      <span className="font-medium text-zinc-200">{v.label}</span>
                      <span className="text-zinc-500">{formatDate(v.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={undo} disabled={past.length === 0} aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={future.length === 0} aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShortcutsOpen(true)} aria-label="Atalhos de teclado (?)" title="Atalhos de teclado (?)">
            <Keyboard className="h-4 w-4" />
          </Button>
        </div>

        <Link
          href={`/app/capa/editor?cut=${cut.id}`}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-3 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Capa</span>
        </Link>
        <Button variant="secondary" onClick={() => setShareOpen(true)}>
          <Share2 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Compartilhar</span>
        </Button>
        <Button onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4" aria-hidden /> Exportar
        </Button>
      </div>

      {/* Main area */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            <EditorPreview />
          </div>
          <EditorTimeline />
        </div>

        {/* Side panels */}
        <aside className="flex min-h-0 flex-col border-t border-line bg-surface-1/40 lg:border-l lg:border-t-0">
          <div className="border-b border-line p-3">
            <Tabs
              tabs={[
                { id: "captions", label: "Legendas" },
                { id: "effects", label: "Efeitos" },
                { id: "overlays", label: "Overlays" },
                { id: "layers", label: "Camadas" },
                { id: "audio", label: "Áudio" },
                { id: "texto", label: "Texto" },
                { id: "auto", label: "Auto" },
              ]}
              value={panel}
              onChange={setPanel}
              className="w-full [&>button]:min-w-0 [&>button]:flex-1 [&>button]:truncate [&>button]:px-1 [&>button]:text-[13px]"
            />
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto p-4")}>
            {panel === "captions" && <CaptionsPanel />}
            {panel === "effects" && <EffectsPanel />}
            {panel === "overlays" && <OverlaysPanel />}
            {panel === "layers" && <LayersPanel />}
            {panel === "audio" && <AudioPanel />}
            {panel === "texto" && <TextoPanel />}
            {panel === "auto" && <AutoPanel />}
          </div>
        </aside>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} cut={cut} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {/* click-away for versions dropdown */}
      {versionsOpen && (
        <button className="fixed inset-0 z-20 cursor-default" aria-hidden tabIndex={-1} onClick={() => setVersionsOpen(false)} />
      )}
      <span className="sr-only" aria-live="polite">
        {playing ? "Reproduzindo" : "Pausado"} — {Math.round(currentTime)} de {Math.round(duration)} segundos
      </span>
    </div>
  );
}
