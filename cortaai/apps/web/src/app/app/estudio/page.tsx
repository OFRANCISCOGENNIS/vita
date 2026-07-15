"use client";

// Estúdio de vídeo multitrilha — layout "EDITOR PROFISSIONAL" (referência do
// usuário): header com logo/PRO + status de autosave + resolução + Exportar,
// rail esquerdo com labels que troca o painel de ferramentas, preview central
// com timeline embaixo, PROPRIEDADES em abas à direita. Mobile: preview
// dominante + barra inferior com gavetas (formato CapCut). Multi-projetos com
// autosave em localStorage; atalhos de teclado profissionais.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AudioLines,
  Captions,
  ChevronDown,
  Circle,
  Clapperboard,
  Download,
  FolderKanban,
  FolderOpen,
  Home,
  Music2,
  Play,
  Redo2,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  SwatchBook,
  Type as TypeIcon,
  Undo2,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { makeProject, validateProject } from "@/lib/video-editor/model";
import {
  getCurrentProjectId,
  getProjectEntry,
  saveProjectEntry,
  setCurrentProjectId,
} from "@/lib/video-editor/project-library";
import { projectDurationMs } from "@/lib/video-editor/timeline-math";
import { useVideoEditor } from "@/store/video-editor";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { TimelineTracks } from "@/components/video-editor/TimelineTracks";
import { MediaBin } from "@/components/video-editor/MediaBin";
import { MusicPanel } from "@/components/video-editor/MusicPanel";
import { CaptionsPanel } from "@/components/video-editor/CaptionsPanel";
import { RecordPanel } from "@/components/video-editor/RecordPanel";
import { ClipInspector } from "@/components/video-editor/ClipInspector";
import { EXPORT_RES_KEY, ExportProjectModal } from "@/components/video-editor/ExportProjectModal";
import { ProjectsModal } from "@/components/video-editor/ProjectsModal";
import { PreviewStage } from "@/components/video-editor/PreviewStage";
import {
  EffectsPanel,
  FiltersPanel,
  StorageCard,
  TextPanel,
  ToolsPanel,
  TransitionsPanel,
  type RailPanel,
} from "@/components/video-editor/StudioPanels";

type Sheet = "bin" | "music" | "record" | "captions" | "inspector" | null;

const RAIL_ITEMS: { id: RailPanel; icon: typeof Wrench; label: string }[] = [
  { id: "ferramentas", icon: Wrench, label: "Ferramentas" },
  { id: "midia", icon: FolderOpen, label: "Mídia" },
  { id: "audio", icon: Music2, label: "Áudio" },
  { id: "texto", icon: TypeIcon, label: "Texto" },
  { id: "legendas", icon: Captions, label: "Legendas" },
  { id: "transicoes", icon: Clapperboard, label: "Transições" },
  { id: "filtros", icon: SwatchBook, label: "Filtros" },
  { id: "efeitos", icon: Sparkles, label: "Efeitos" },
  { id: "gravar", icon: Circle, label: "Gravar" },
];

const PANEL_TITLES: Record<RailPanel, string> = {
  ferramentas: "Ferramentas",
  midia: "Mídia",
  audio: "Áudio",
  texto: "Texto",
  legendas: "Legendas",
  transicoes: "Transições",
  filtros: "Filtros",
  efeitos: "Efeitos",
  gravar: "Gravar",
};

const RES_OPTIONS = [
  { id: "720p", label: "HD" },
  { id: "1080p", label: "Full HD" },
  { id: "1440p", label: "2K" },
  { id: "2160p", label: "4K" },
  { id: "4320p", label: "8K" },
] as const;

export default function EstudioPage() {
  const loadProject = useVideoEditor((s) => s.loadProject);
  const loadFromJson = useVideoEditor((s) => s.loadFromJson);
  const addSource = useVideoEditor((s) => s.addSource);
  const undo = useVideoEditor((s) => s.undo);
  const redo = useVideoEditor((s) => s.redo);
  const canUndo = useVideoEditor((s) => s.past.length > 0);
  const canRedo = useVideoEditor((s) => s.future.length > 0);
  const sourceCount = useVideoEditor((s) => Object.keys(s.sources).length);
  const selectedClipId = useVideoEditor((s) => s.selectedClipId);
  const select = useVideoEditor((s) => s.select);
  const splitAtPlayhead = useVideoEditor((s) => s.splitAtPlayhead);
  const addTextClip = useVideoEditor((s) => s.addTextClip);
  const renameProject = useVideoEditor((s) => s.renameProject);
  const projectName = useVideoEditor((s) => s.project.name);
  const user = useAuthStore((s) => s.user);
  const seeded = useRef(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [rail, setRail] = useState<RailPanel>("ferramentas");
  const [toolsOpen, setToolsOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [saveState, setSaveState] = useState<"salvo" | "salvando">("salvo");
  const [exportRes, setExportRes] = useState<string>("1080p");

  // resolução padrão de exportação (persistida; o modal Exportar lê daqui)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(EXPORT_RES_KEY);
      if (stored && RES_OPTIONS.some((r) => r.id === stored)) setExportRes(stored);
    } catch {
      /* sem storage */
    }
  }, []);

  function pickRes(id: string) {
    setExportRes(id);
    try {
      localStorage.setItem(EXPORT_RES_KEY, id);
    } catch {
      /* sem storage */
    }
  }

  // ------- dividir/fatiar o clipe no cursor (com feedback honesto) --------------
  function handleSplit() {
    const countClips = (p: ReturnType<typeof useVideoEditor.getState>["project"]) =>
      p.tracks.reduce((n, t) => n + t.clips.length, 0);
    const before = countClips(useVideoEditor.getState().project);
    splitAtPlayhead();
    const after = countClips(useVideoEditor.getState().project);
    if (after > before) {
      toast("Vídeo dividido no cursor", { description: "Cada metade virou um clipe — arraste, apague ou edite separadamente." });
    } else {
      toast("Nada para dividir aqui", {
        description: "Mova o cursor da linha do tempo para cima de um clipe e toque em Dividir de novo.",
        variant: "error",
      });
    }
  }

  // ------- seed / restauração do projeto atual --------------------------------
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    try {
      const currentId = getCurrentProjectId();
      const entry = currentId ? getProjectEntry(currentId) : null;
      if (entry) {
        const valid = validateProject(entry.project);
        if (valid) {
          loadFromJson(valid);
          (entry.sources ?? []).forEach((src) => {
            if (src && typeof src.id === "string" && typeof src.mediaId === "string") addSource(src);
          });
          return;
        }
      }
    } catch {
      /* biblioteca corrompida → projeto novo */
    }
    const project = makeProject("Meu vídeo", { w: 1080, h: 1920 }, 30);
    loadProject(project);
    setCurrentProjectId(project.id);
  }, [loadProject, loadFromJson, addSource]);

  // ------- autosave na biblioteca de projetos (debounce) -----------------------
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useVideoEditor.subscribe((s, prev) => {
      if (s.project === prev.project && s.sources === prev.sources) return;
      setSaveState("salvando");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveProjectEntry(s.project, Object.values(s.sources), projectDurationMs(s.project.tracks));
        setCurrentProjectId(s.project.id);
        setSaveState("salvo");
      }, 800);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);

  // ------- abrir gavetas/painéis a partir da timeline (botões "+") --------------
  useEffect(() => {
    function onOpenSheet(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "bin" || detail === "music" || detail === "record" || detail === "captions" || detail === "inspector") {
        setSheet(detail);
      }
      // no desktop, o mesmo evento troca o painel do rail
      const map: Record<string, RailPanel | undefined> = { bin: "midia", music: "audio", captions: "legendas", record: "gravar" };
      const panel = map[detail];
      if (panel) {
        setRail(panel);
        setToolsOpen(true);
      }
    }
    window.addEventListener("studio-open-sheet", onOpenSheet);
    return () => window.removeEventListener("studio-open-sheet", onOpenSheet);
  }, []);

  // ------- atalhos de teclado ---------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const st = useVideoEditor.getState();
      if (e.key === " ") {
        e.preventDefault();
        window.dispatchEvent(new Event("studio-toggle-play"));
      } else if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        st.splitAtPlayhead();
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selectedClipId) {
        e.preventDefault();
        st.deleteClip(st.selectedClipId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && st.selectedClipId) {
        e.preventDefault();
        st.duplicateClip(st.selectedClipId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initial = (user?.name ?? "C").trim().charAt(0).toUpperCase() || "C";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface bg-[radial-gradient(ellipse_60%_40%_at_50%_-10%,rgba(139,92,246,0.10),transparent)]">
      {/* Topo */}
      <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-surface-1/50 px-3 py-2 backdrop-blur-xl">
        <Link
          href="/app"
          title="Sair do estúdio"
          aria-label="Sair do estúdio"
          className="inline-flex items-center rounded-lg p-1.5 text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-glow">
            <Play className="ml-0.5 h-4 w-4 fill-white text-white" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold tracking-wide text-white">ESTÚDIO</span>
            <span className="block text-[8px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Editor profissional</span>
          </span>
          <span className="rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold tracking-wider text-violet-300">
            PRO
          </span>
        </div>

        {/* nome do projeto + autosave */}
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <input
            key={projectName}
            defaultValue={projectName}
            onBlur={(e) => renameProject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label="Nome do projeto"
            className="w-full max-w-[240px] truncate rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-center text-sm font-semibold text-white hover:border-line focus:border-violet-400 focus:outline-none"
          />
          <span className="flex items-center gap-1 text-[9px] text-zinc-500">
            <span className={cn("h-1.5 w-1.5 rounded-full", saveState === "salvo" ? "bg-emerald-400" : "animate-pulse bg-amber-400")} aria-hidden />
            {saveState === "salvo" ? "Salvo automaticamente" : "Salvando…"}
          </span>
        </div>

        <button
          onClick={() => setProjectsOpen(true)}
          aria-label="Projetos"
          title="Projetos"
          className="rounded-lg p-2 text-zinc-400 transition-all hover:bg-white/5 hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <FolderKanban className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            aria-label="Desfazer (Ctrl+Z)"
            title="Desfazer (Ctrl+Z)"
            className="hidden rounded-lg p-2 text-zinc-400 transition-all hover:bg-white/5 hover:text-white active:scale-90 disabled:opacity-40 lg:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            aria-label="Refazer (Ctrl+Shift+Z)"
            title="Refazer (Ctrl+Shift+Z)"
            className="hidden rounded-lg p-2 text-zinc-400 transition-all hover:bg-white/5 hover:text-white active:scale-90 disabled:opacity-40 lg:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="btn-gradient-live ml-1 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow transition-all hover:shadow-[0_0_48px_-8px_rgba(217,70,239,0.6)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exportar
          </button>
          <select
            value={exportRes}
            onChange={(e) => pickRes(e.target.value)}
            aria-label="Resolução de exportação"
            title="Resolução padrão da exportação"
            className="hidden rounded-xl border border-line bg-surface-1 px-2 py-1.5 text-xs font-semibold text-zinc-200 sm:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {RES_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <span
            title={user?.name ?? "Você"}
            className="relative ml-1 hidden h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-surface-2 text-xs font-bold text-violet-200 sm:flex"
          >
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-surface bg-emerald-400" aria-hidden />
          </span>
        </div>
      </header>

      {/* Área principal */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* rail esquerdo com labels (desktop) */}
        <nav aria-label="Seções do editor" className="hidden shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/40 lg:flex lg:w-[164px]">
          <div className="editor-scroll min-h-0 flex-1 overflow-y-auto p-2">
            <Link
              href="/app"
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <Home className="h-4 w-4" aria-hidden /> Início
            </Link>
            <button
              onClick={() => setProjectsOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <FolderKanban className="h-4 w-4" aria-hidden /> Projetos
            </button>
            <div className="my-1.5 border-t border-white/[0.06]" />
            {RAIL_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setRail(item.id);
                  setToolsOpen(true);
                }}
                aria-pressed={rail === item.id}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  rail === item.id ? "bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-400/30" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <item.icon className={cn("h-4 w-4", item.id === "gravar" && "text-rose-400")} aria-hidden />
                {item.label}
                {item.id === "midia" && sourceCount > 0 && (
                  <span className="ml-auto rounded-full bg-violet-500/20 px-1.5 text-[9px] font-bold text-violet-300">{sourceCount}</span>
                )}
              </button>
            ))}
          </div>
          <div className="shrink-0 p-2">
            <StorageCard onManage={() => setProjectsOpen(true)} />
          </div>
        </nav>

        {/* centro: preview + timeline + faixa de ferramentas (desktop) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* o VÍDEO tem prioridade: altura mínima garantida mesmo em telas baixas */}
          <div className="min-h-[240px] flex-1 p-2 sm:p-3">
            <PreviewStage />
          </div>
          <div className="shrink-0 px-2 pb-1 sm:px-3">
            <TimelineTracks />
          </div>
          {/* faixa inferior larga: encolhe (com scroll próprio) para nunca engolir o vídeo */}
          <div
            className={cn(
              "hidden min-h-0 flex-col border-t border-white/[0.06] bg-surface-1/25 lg:flex",
              toolsOpen ? "shrink" : "shrink-0",
            )}
            style={toolsOpen ? { maxHeight: "32dvh", minHeight: 92 } : undefined}
          >
            <button
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {rail === "ferramentas" ? "Ferramentas de edição" : PANEL_TITLES[rail]}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !toolsOpen && "rotate-180")} aria-hidden />
            </button>
            {toolsOpen && (
              <div key={rail} className="panel-fade editor-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                {rail === "ferramentas" && <ToolsPanel onNavigate={setRail} />}
                {rail === "midia" && <MediaBin />}
                {rail === "audio" && <MusicPanel />}
                {rail === "texto" && <TextPanel />}
                {rail === "legendas" && <CaptionsPanel />}
                {rail === "transicoes" && <TransitionsPanel />}
                {rail === "filtros" && <FiltersPanel />}
                {rail === "efeitos" && <EffectsPanel />}
                {rail === "gravar" && <RecordPanel />}
              </div>
            )}
          </div>
        </div>

        {/* Propriedades (desktop) */}
        <aside className="editor-scroll hidden shrink-0 overflow-y-auto border-l border-white/[0.06] bg-surface-1/30 p-3 lg:block lg:w-[292px]">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Propriedades
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => addTextClip("Seu texto")}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] font-medium text-zinc-300 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <TypeIcon className="h-3 w-3" aria-hidden /> Texto
              </button>
              {selectedClipId && (
                <button
                  onClick={() => select(null)}
                  aria-label="Fechar propriedades (desmarcar clipe)"
                  title="Desmarcar clipe"
                  className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
                </button>
              )}
            </div>
          </div>
          <ClipInspector />
        </aside>
      </div>

      {/* Barra inferior (mobile) */}
      <nav aria-label="Ferramentas" className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-t border-white/[0.06] bg-surface-1/80 px-2 pt-1 pb-[calc(0.35rem+env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <MobileTool icon={SlidersHorizontal} label="Editar" onClick={() => setSheet("inspector")} highlight={selectedClipId != null} />
        <MobileTool icon={Scissors} label="Dividir" onClick={handleSplit} />
        <MobileTool icon={FolderOpen} label={`Mídia${sourceCount > 0 ? ` (${sourceCount})` : ""}`} onClick={() => setSheet("bin")} />
        <MobileTool icon={AudioLines} label="Áudio" onClick={() => setSheet("music")} />
        <MobileTool icon={TypeIcon} label="Texto" onClick={() => addTextClip("Seu texto")} />
        <MobileTool icon={Captions} label="Legendas" onClick={() => setSheet("captions")} />
        <MobileTool icon={Circle} label="Gravar" onClick={() => setSheet("record")} />
      </nav>

      {/* Gavetas (mobile) */}
      <MobileSheet title="Mídia" open={sheet === "bin"} onClose={() => setSheet(null)}>
        <MediaBin />
      </MobileSheet>
      <MobileSheet title="Música" open={sheet === "music"} onClose={() => setSheet(null)}>
        <MusicPanel />
      </MobileSheet>
      <MobileSheet title="Gravar" open={sheet === "record"} onClose={() => setSheet(null)}>
        <RecordPanel />
      </MobileSheet>
      <MobileSheet title="Legendas" open={sheet === "captions"} onClose={() => setSheet(null)}>
        <CaptionsPanel />
      </MobileSheet>
      <MobileSheet title="Ajustes do clipe" open={sheet === "inspector"} onClose={() => setSheet(null)}>
        <ClipInspector />
      </MobileSheet>

      <ExportProjectModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ProjectsModal open={projectsOpen} onClose={() => setProjectsOpen(false)} />
    </div>
  );
}

function MobileTool({
  icon: Icon,
  label,
  onClick,
  highlight,
}: {
  icon: typeof FolderOpen;
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-w-[62px] flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-medium transition-all hover:bg-white/5 hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
        highlight ? "text-violet-300" : "text-zinc-300",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </button>
  );
}

function MobileSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-white/[0.08] bg-surface-2/95 shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-transform duration-300 ease-out lg:hidden",
          open ? "translate-y-0" : "translate-y-full",
        )}
        style={{ maxHeight: "70dvh" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <div className="flex items-center justify-between px-4 pb-2 pt-1.5">
          <span className="text-sm font-semibold text-white">{title}</span>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <div className="editor-scroll max-h-[calc(70dvh-3.5rem)] overflow-y-auto border-t border-white/[0.06] p-3">{open && <div className="panel-fade">{children}</div>}</div>
      </div>
      {open && <button aria-hidden tabIndex={-1} onClick={onClose} className="fixed inset-0 z-30 bg-black/50 lg:hidden" />}
    </>
  );
}
