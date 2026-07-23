"use client";

// Professional editor shell: preview + side panels + multi-track timeline,
// keyboard shortcuts, autosave, version history and export modal.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  History,
  Image as ImageIcon,
  Keyboard,
  Layers,
  Loader2,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Ratio,
  Redo2,
  Scissors,
  Share2,
  Sparkles,
  Sticker,
  Type,
  Undo2,
} from "lucide-react";
import * as api from "@/lib/api";
import { cn, formatDate, formatTimecode } from "@/lib/utils";
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
import { FormatPanel } from "./format-panel";
import { ExportModal } from "./export-modal";
import { ShortcutsModal } from "./shortcuts-modal";

type PanelTab = "captions" | "effects" | "overlays" | "layers" | "audio" | "texto" | "formato";

const PANEL_TITLES: Record<PanelTab, string> = {
  formato: "Formato",
  captions: "Legendas",
  effects: "Efeitos",
  overlays: "Overlays",
  layers: "Camadas",
  audio: "Áudio",
  texto: "Texto",
};

// Barra inferior de ferramentas (mobile, estilo CapCut): ícone + label.
const MOBILE_TOOLS: { id: PanelTab; label: string; icon: typeof Ratio }[] = [
  { id: "formato", label: "Formato", icon: Ratio },
  { id: "captions", label: "Legendas", icon: Captions },
  { id: "effects", label: "Efeitos", icon: Sparkles },
  { id: "texto", label: "Texto", icon: Type },
  { id: "audio", label: "Áudio", icon: Music2 },
  { id: "overlays", label: "Overlays", icon: Sticker },
  { id: "layers", label: "Camadas", icon: Layers },
];

/** Conteúdo do histórico de versões — usado no dropdown desktop e no menu "⋯" mobile. */
function VersionsList({ onRestored }: { onRestored?: () => void }) {
  const { versions, markSaved, restoreVersion } = useEditorStore();
  return (
    <>
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
                onRestored?.();
                toast("Versão restaurada", { description: v.label, variant: "info" });
              }}
            >
              <span className="font-medium text-zinc-200">{v.label}</span>
              <span className="text-zinc-500">{formatDate(v.at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

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
    loadCut,
    apply,
    undo,
    redo,
    togglePlay,
    setPlaying,
    seek,
    splitAtPlayhead,
    markSaved,
    revokeMedia,
  } = useEditorStore();

  const [loadError, setLoadError] = useState(false);
  const [panel, setPanel] = useState<PanelTab>("captions");
  const [panelOpen, setPanelOpen] = useState(true); // desktop: coluna lateral
  const [sheetOpen, setSheetOpen] = useState(false); // mobile: bottom-sheet
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
          title="Clipe não encontrado"
          description="Ele pode ter sido excluído."
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
      <div className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3" role="status" aria-label="Carregando clipe">
        <Skeleton className="h-12 w-full shrink-0" />
        <div className="flex min-h-0 flex-1 gap-3">
          <Skeleton className="h-full min-w-0 flex-1" />
          <Skeleton className="hidden h-full w-[340px] shrink-0 lg:block" />
        </div>
        <Skeleton className="h-44 w-full shrink-0" />
        <Skeleton className="h-14 w-full shrink-0 lg:hidden" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* Editor toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-1/60 px-4 py-2">
        <Link
          href={`/app/projeto?id=${cut.projectId}`}
          title="Voltar ao projeto"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Voltar</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white" title={cut.title}>{cut.title}</p>
        </div>

        {/* Autosave indicator — texto no desktop, só ícone no mobile */}
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
        <span className="inline-flex md:hidden" aria-live="polite" aria-label={saving || dirty ? "Salvando" : "Salvo"}>
          {saving || dirty ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          )}
        </span>

        {/* Version history (desktop) */}
        <div className="relative hidden md:block">
          <Button variant="ghost" size="sm" onClick={() => setVersionsOpen((v) => !v)} aria-expanded={versionsOpen} aria-label="Histórico de versões" title="Histórico de versões">
            <History className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Versões</span>
            <ChevronDown className="h-3 w-3" aria-hidden />
          </Button>
          {versionsOpen && (
            <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-line bg-surface-2 p-2 shadow-2xl animate-fade-up">
              <VersionsList onRestored={() => setVersionsOpen(false)} />
            </div>
          )}
        </div>

        <div className="hidden items-center gap-1 lg:flex">
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
          title="Estúdio de Capa"
          className="hidden h-10 items-center gap-2 rounded-xl border border-line bg-surface-3 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 md:inline-flex"
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Capa</span>
        </Link>
        <Button variant="secondary" className="hidden md:inline-flex" onClick={() => setShareOpen(true)} title="Compartilhar">
          <Share2 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Compartilhar</span>
        </Button>

        {/* Menu "⋯" (mobile) — abriga o que saiu da toolbar compacta */}
        <div className="relative md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-label="Mais opções" title="Mais opções">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {moreOpen && (
            <div className="absolute right-0 top-10 z-50 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface-2 p-2 shadow-2xl animate-fade-up">
              <Link
                href={`/app/capa/editor?cut=${cut.id}`}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Estúdio de Capa
              </Link>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                onClick={() => {
                  setShareOpen(true);
                  setMoreOpen(false);
                }}
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden /> Compartilhar
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                onClick={() => {
                  setShortcutsOpen(true);
                  setMoreOpen(false);
                }}
              >
                <Keyboard className="h-3.5 w-3.5" aria-hidden /> Atalhos de teclado
              </button>
              <div className="my-1 border-t border-line" />
              <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500">Versões</p>
              <VersionsList onRestored={() => setMoreOpen(false)} />
            </div>
          )}
        </div>

        <Button onClick={() => setExportOpen(true)} title="Exportar">
          <Download className="h-4 w-4" aria-hidden /> Exportar
        </Button>
      </div>

      {/* Main area — CapCut grid: stage (flex-1) + collapsible right panel; timeline spans full width below */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Preview stage */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <EditorPreview />
          {/* Panel collapse/expand toggle */}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? "Recolher painel" : "Expandir painel"}
            title={panelOpen ? "Recolher painel" : "Expandir painel"}
            className="absolute right-2 top-1/2 z-30 hidden h-12 w-6 -translate-y-1/2 items-center justify-center rounded-lg bg-black/55 text-zinc-400 ring-1 ring-[rgba(255,255,255,0.12)] backdrop-blur transition-colors hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 lg:flex"
          >
            {panelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Side panels — bottom-sheet no mobile (sheetOpen), coluna lateral no desktop (panelOpen) */}
        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col overflow-hidden bg-surface-1/40 transition-all duration-300 motion-reduce:transition-none",
            sheetOpen ? "max-h-[42dvh] border-t border-line" : "max-h-0 border-t border-transparent",
            panelOpen
              ? "lg:max-h-none lg:w-[340px] lg:border-l lg:border-t-0"
              : "lg:max-h-none lg:w-0 lg:border-l lg:border-t-0",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col lg:w-[340px]">
            {/* Header mobile da sheet: handle + título + fechar */}
            <div className="relative flex items-center border-b border-line px-3 py-2 lg:hidden">
              <span className="text-xs font-semibold text-white">{PANEL_TITLES[panel]}</span>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Fechar painel"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg px-8 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <span className="block h-1 w-9 rounded-full bg-zinc-600" aria-hidden />
              </button>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Fechar painel"
                title="Fechar painel"
                className="ml-auto rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            {/* Header desktop: abas */}
            <div className="hidden items-center gap-1 border-b border-line p-2.5 lg:flex">
              <Tabs
                tabs={[
                  { id: "captions", label: "Legendas" },
                  { id: "effects", label: "Efeitos" },
                  { id: "overlays", label: "Overlays" },
                  { id: "layers", label: "Camadas" },
                  { id: "audio", label: "Áudio" },
                  { id: "texto", label: "Texto" },
                ]}
                value={panel}
                onChange={setPanel}
                className="min-w-0 flex-1 [&>button]:min-w-0 [&>button]:flex-1 [&>button]:truncate [&>button]:px-1 [&>button]:text-[13px]"
              />
            </div>
            <div key={panel} className="panel-fade editor-scroll min-h-0 flex-1 overflow-y-auto p-4">
              {panel === "formato" && <FormatPanel />}
              {panel === "captions" && <CaptionsPanel />}
              {panel === "effects" && <EffectsPanel />}
              {panel === "overlays" && <OverlaysPanel />}
              {panel === "layers" && <LayersPanel />}
              {panel === "audio" && <AudioPanel />}
              {panel === "texto" && <TextoPanel />}
            </div>
          </div>
        </aside>
      </div>

      {/* Linha de transporte mobile (estilo CapCut): timecode | dividir | play | undo/redo */}
      <div className="flex shrink-0 items-center gap-1 border-t border-line bg-surface-1/60 px-3 py-1 lg:hidden">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-zinc-400">
          {formatTimecode(currentTime)} <span className="text-zinc-600">/ {formatTimecode(duration)}</span>
        </span>
        <button
          onClick={splitAtPlayhead}
          aria-label="Dividir no playhead"
          title="Dividir no playhead"
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Scissors className="h-4 w-4" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pausar" : "Reproduzir"}
          className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="flex flex-1 items-center justify-end gap-0.5">
          <button
            onClick={undo}
            disabled={past.length === 0}
            aria-label="Desfazer"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Refazer"
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Full-width timeline dock */}
      <EditorTimeline />

      {/* Barra inferior de ferramentas (mobile, estilo CapCut) */}
      <nav
        aria-label="Ferramentas"
        className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-line bg-surface-1/95 px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {MOBILE_TOOLS.map(({ id, label, icon: Icon }) => {
          const active = sheetOpen && panel === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (active) {
                  setSheetOpen(false);
                } else {
                  setPanel(id);
                  setSheetOpen(true);
                }
              }}
              aria-pressed={active}
              className={cn(
                "flex min-w-[60px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                active ? "text-violet-300" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </button>
          );
        })}
      </nav>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} cut={cut} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {/* click-away for the versions/more dropdowns */}
      {(versionsOpen || moreOpen) && (
        <button
          className="fixed inset-0 z-40 cursor-default"
          aria-hidden
          tabIndex={-1}
          onClick={() => {
            setVersionsOpen(false);
            setMoreOpen(false);
          }}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {playing ? "Reproduzindo" : "Pausado"} — {Math.round(currentTime)} de {Math.round(duration)} segundos
      </span>
    </div>
  );
}
