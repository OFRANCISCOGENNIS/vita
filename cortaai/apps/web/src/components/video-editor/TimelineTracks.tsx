"use client";

// Timeline multitrilha INTERATIVA — Fatia C: além de renderizar o modelo,
// permite arrastar clipes (com snap magnético em bordas/playhead), aparar
// pelas alças nas pontas do clipe selecionado, dividir no playhead, duplicar,
// apagar e ripple delete. O arrasto é local (preview) e só vira histórico no
// pointerup — 1 ação = 1 undo.

import { useMemo, useRef, useState } from "react";
import {
  Copy,
  Plus,
  Film,
  Lock,
  LockOpen,
  Music2,
  Scissors,
  Sparkles,
  Sticker,
  Trash2,
  Type as TypeIcon,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Clip, Track, TrackType } from "@/lib/video-editor/model";
import { boundaryCandidates, clipEndMs, projectDurationMs, snapTime, timeToPx } from "@/lib/video-editor/timeline-math";
import { useVideoEditor } from "@/store/video-editor";

const TRACK_H = 34;
const LABEL_W = 112;
const SNAP_PX = 8;

const TRACK_ICON: Record<TrackType, typeof Film> = {
  video: Film,
  audio: Music2,
  text: TypeIcon,
  sticker: Sticker,
  effect: Sparkles,
};

const TRACK_COLOR: Record<TrackType, string> = {
  video: "from-violet-700/70 to-fuchsia-700/50 ring-violet-400/40",
  audio: "from-emerald-700/60 to-teal-700/40 ring-emerald-400/40",
  text: "from-sky-700/60 to-blue-700/40 ring-sky-400/40",
  sticker: "from-amber-600/60 to-orange-700/40 ring-amber-400/40",
  effect: "from-pink-700/60 to-rose-700/40 ring-pink-400/40",
};

function fmt(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

type DragKind = "move" | "trimL" | "trimR";

interface DragState {
  kind: DragKind;
  clipId: string;
  startClientX: number;
  orig: Clip;
  /** move: novo start; trimL: novo start; trimR: novo end (tudo em ms). */
  previewMs: number;
  moved: boolean;
}

export function TimelineTracks() {
  const project = useVideoEditor((s) => s.project);
  const sources = useVideoEditor((s) => s.sources);
  const pxPerSecond = useVideoEditor((s) => s.pxPerSecond);
  const playheadMs = useVideoEditor((s) => s.playheadMs);
  const selectedClipId = useVideoEditor((s) => s.selectedClipId);
  const setPlayhead = useVideoEditor((s) => s.setPlayhead);
  const setZoom = useVideoEditor((s) => s.setZoom);
  const select = useVideoEditor((s) => s.select);
  const moveClip = useVideoEditor((s) => s.moveClip);
  const trimStart = useVideoEditor((s) => s.trimStart);
  const trimEnd = useVideoEditor((s) => s.trimEnd);
  const splitAtPlayhead = useVideoEditor((s) => s.splitAtPlayhead);
  const deleteClip = useVideoEditor((s) => s.deleteClip);
  const rippleDelete = useVideoEditor((s) => s.rippleDelete);
  const duplicateClip = useVideoEditor((s) => s.duplicateClip);
  const addTextClip = useVideoEditor((s) => s.addTextClip);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const hasTextTrack = project.tracks.some((t) => t.type === "text");

  const durationMs = useMemo(() => Math.max(4000, projectDurationMs(project.tracks) + 2000), [project.tracks]);
  const width = timeToPx(durationMs, pxPerSecond);

  const tickStep = pxPerSecond >= 120 ? 1000 : pxPerSecond >= 50 ? 2000 : 5000;
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += tickStep) ticks.push(t);

  function seekFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setPlayhead((x / pxPerSecond) * 1000);
  }

  /** Duração da fonte para os trims (imagem/texto: livre). */
  function sourceDurMs(clip: Clip): number {
    const src = sources[clip.sourceId];
    if (!src || src.kind === "image") return Number.MAX_SAFE_INTEGER;
    return src.durationMs > 0 ? src.durationMs : Number.MAX_SAFE_INTEGER;
  }

  function beginDrag(e: React.PointerEvent, clip: Clip, track: Track, kind: DragKind) {
    if (track.locked) return;
    e.stopPropagation();
    e.preventDefault();
    select(clip.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const initial: DragState = {
      kind,
      clipId: clip.id,
      startClientX: e.clientX,
      orig: clip,
      previewMs: kind === "trimR" ? clipEndMs(clip) : clip.startInTimeline,
      moved: false,
    };
    dragRef.current = initial;
    setDrag(initial);
  }

  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const deltaMs = ((e.clientX - d.startClientX) / pxPerSecond) * 1000;
    const threshold = (SNAP_PX / pxPerSecond) * 1000;
    const candidates = [...boundaryCandidates(project.tracks, d.clipId), playheadMs, 0];

    let previewMs: number;
    if (d.kind === "move") {
      const raw = Math.max(0, d.orig.startInTimeline + deltaMs);
      // snap pela borda esquerda E pela direita
      const snappedL = snapTime(raw, candidates, threshold);
      const snappedR = snapTime(raw + d.orig.duration, candidates, threshold) - d.orig.duration;
      previewMs = Math.abs(snappedL - raw) <= Math.abs(snappedR - raw) ? snappedL : Math.max(0, snappedR);
    } else if (d.kind === "trimL") {
      const raw = d.orig.startInTimeline + deltaMs;
      previewMs = Math.min(clipEndMs(d.orig) - 100, Math.max(0, snapTime(raw, candidates, threshold)));
    } else {
      const raw = clipEndMs(d.orig) + deltaMs;
      previewMs = Math.max(d.orig.startInTimeline + 100, snapTime(raw, candidates, threshold));
    }
    const next = { ...d, previewMs: Math.round(previewMs), moved: true };
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || !d.moved) return;
    if (d.kind === "move") moveClip(d.clipId, d.previewMs);
    else if (d.kind === "trimL") trimStart(d.clipId, d.previewMs, sourceDurMs(d.orig));
    else trimEnd(d.clipId, d.previewMs, sourceDurMs(d.orig));
  }

  /** Posição/tamanho visual do clipe considerando o arrasto em andamento. */
  function clipRect(clip: Clip): { left: number; w: number } {
    let start = clip.startInTimeline;
    let end = clipEndMs(clip);
    if (drag && drag.clipId === clip.id && drag.moved) {
      if (drag.kind === "move") {
        start = drag.previewMs;
        end = drag.previewMs + clip.duration;
      } else if (drag.kind === "trimL") start = drag.previewMs;
      else end = drag.previewMs;
    }
    return { left: timeToPx(start, pxPerSecond), w: Math.max(6, timeToPx(end - start, pxPerSecond) - 2) };
  }

  const hasSelection = selectedClipId != null;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-1/60 shadow-[0_-8px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* barra de ferramentas + zoom */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-2 py-1">
        <span className="mr-1 hidden font-mono text-xs text-zinc-400 sm:inline">
          {fmt(playheadMs)} <span className="text-zinc-600">/ {fmt(projectDurationMs(project.tracks))}</span>
        </span>
        <ToolButton label="Dividir no playhead (S)" onClick={splitAtPlayhead}>
          <Scissors className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Duplicar clipe" disabled={!hasSelection} onClick={() => selectedClipId && duplicateClip(selectedClipId)}>
          <Copy className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Apagar clipe (Delete)" disabled={!hasSelection} onClick={() => selectedClipId && deleteClip(selectedClipId)}>
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <button
          onClick={() => selectedClipId && rippleDelete(selectedClipId)}
          disabled={!hasSelection}
          title="Apagar e puxar os clipes seguintes (ripple delete)"
          className="rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Ripple
        </button>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton label="Diminuir zoom" onClick={() => setZoom(pxPerSecond - 20)}>
            <ZoomOut className="h-4 w-4" />
          </ToolButton>
          <span className="w-14 text-center font-mono text-[11px] text-zinc-500">{pxPerSecond}px/s</span>
          <ToolButton label="Aumentar zoom" onClick={() => setZoom(pxPerSecond + 20)}>
            <ZoomIn className="h-4 w-4" />
          </ToolButton>
        </div>
      </div>

      <div className="flex">
        {/* rótulos das trilhas */}
        <div className="shrink-0 border-r border-white/[0.06] bg-white/[0.02]" style={{ width: LABEL_W }}>
          <div className="h-6 border-b border-line/60" aria-hidden />
          {project.tracks.map((t) => (
            <TrackLabel key={t.id} track={t} />
          ))}
        </div>

        {/* área rolável */}
        <div className="editor-scroll min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }}>
            {/* régua */}
            <div className="relative h-6 border-b border-line/60" role="presentation" onClick={seekFromEvent}>
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 flex h-full flex-col justify-between text-[9px] text-zinc-600" style={{ left: timeToPx(t, pxPerSecond) }}>
                  <span className="pl-1">{fmt(t)}</span>
                  <span className="h-1.5 w-px bg-zinc-700" />
                </span>
              ))}
            </div>

            {/* trilhas */}
            <div
              className="relative cursor-crosshair"
              onClick={seekFromEvent}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ height: (project.tracks.length + (hasTextTrack ? 0 : 1)) * TRACK_H }}
            >
              {project.tracks.map((track, ti) => (
                <div key={track.id} className="absolute inset-x-0 border-b border-line/40" style={{ top: ti * TRACK_H, height: TRACK_H }}>
                  {track.clips.map((clip) => {
                    const rect = clipRect(clip);
                    const isSel = selectedClipId === clip.id;
                    const poster = sources[clip.sourceId]?.posterDataUrl ?? null;
                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => beginDrag(e, clip, track, "move")}
                        onPointerMove={onDragMove}
                        onPointerUp={endDrag}
                        onClick={(e) => {
                          e.stopPropagation();
                          select(clip.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            select(clip.id);
                          }
                        }}
                        className={cn(
                          "absolute inset-y-1.5 touch-none select-none overflow-hidden rounded-lg bg-gradient-to-r px-2 text-left text-[10px] font-medium text-white/90 ring-1 ring-inset transition-[box-shadow,filter]",
                          "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_8px_-2px_rgba(0,0,0,0.5)] hover:brightness-110",
                          TRACK_COLOR[track.type],
                          isSel ? "ring-2 ring-white shadow-glow brightness-110" : "",
                          track.hidden && "opacity-40",
                          track.locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
                        )}
                        style={{
                          left: rect.left,
                          width: rect.w,
                          // filmstrip estilo CapCut: o poster do vídeo repetido no clipe
                          ...(poster
                            ? { backgroundImage: `url(${poster})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }
                            : {}),
                        }}
                        title={`${fmt(clip.startInTimeline)} → ${fmt(clipEndMs(clip))}`}
                      >
                        <span className={cn("pointer-events-none flex h-full items-center gap-1 truncate", poster && "drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]")}>
                          {clip.text?.content ?? sources[clip.sourceId]?.name ?? clip.sourceId}
                          {clip.speed !== 1 && <span className="rounded bg-black/40 px-1 text-[8px]">{clip.speed}x</span>}
                          {clip.filterId && clip.filterId !== "none" && <span className="rounded bg-black/40 px-1 text-[8px]">fx</span>}
                        </span>
                        {/* alças de trim (só no clipe selecionado) */}
                        {isSel && !track.locked && (
                          <>
                            <span
                              onPointerDown={(e) => beginDrag(e, clip, track, "trimL")}
                              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-white/80"
                              aria-hidden
                            />
                            <span
                              onPointerDown={(e) => beginDrag(e, clip, track, "trimR")}
                              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-white/80"
                              aria-hidden
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* "+" no fim da trilha de vídeo (estilo CapCut) → abre a Mídia */}
                  {track.type === "video" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent("studio-open-sheet", { detail: "bin" }));
                      }}
                      aria-label="Adicionar mídia"
                      title="Adicionar mídia"
                      className="absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-white text-black shadow-lg transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      style={{ left: timeToPx(track.clips.reduce((m, c) => Math.max(m, clipEndMs(c)), 0), pxPerSecond) + 8 }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}

                  {/* trilha de áudio vazia → "+ Adicionar áudio" */}
                  {track.type === "audio" && track.clips.length === 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent("studio-open-sheet", { detail: "music" }));
                      }}
                      className="absolute inset-y-1.5 left-1 flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      style={{ width: 220 }}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar áudio
                    </button>
                  )}
                </div>
              ))}

              {/* linha "+ Adicionar texto" quando ainda não há trilha de texto */}
              {!hasTextTrack && (
                <div className="absolute inset-x-0 border-b border-line/40" style={{ top: project.tracks.length * TRACK_H, height: TRACK_H }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addTextClip("Seu texto");
                    }}
                    className="absolute inset-y-1.5 left-1 flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    style={{ width: 220 }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar texto
                  </button>
                </div>
              )}

              {/* playhead */}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-gradient-to-b from-fuchsia-400 to-violet-500 shadow-[0_0_8px_rgba(217,70,239,0.8)]"
                style={{ left: timeToPx(playheadMs, pxPerSecond) }}
              >
                <span className="absolute -left-[5px] -top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-fuchsia-400 drop-shadow-[0_0_4px_rgba(217,70,239,0.9)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-white/10 hover:text-white active:scale-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      {children}
    </button>
  );
}

function TrackLabel({ track }: { track: Track }) {
  const Icon = TRACK_ICON[track.type];
  const setTrackFlag = useVideoEditor((s) => s.setTrackFlag);
  const canMute = track.type === "video" || track.type === "audio";
  return (
    <div className="flex items-center gap-1 border-b border-line/40 px-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500" style={{ height: TRACK_H }}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{track.name}</span>
      <span className="ml-auto flex items-center">
        {canMute && (
          <button
            onClick={() => setTrackFlag(track.id, "muted", !track.muted)}
            className={cn("rounded p-1 hover:text-white", track.muted ? "text-rose-400" : "text-zinc-600")}
            aria-pressed={track.muted}
            title={track.muted ? "Ativar som da trilha" : "Silenciar trilha"}
          >
            {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
        )}
        <button
          onClick={() => setTrackFlag(track.id, "locked", !track.locked)}
          className={cn("rounded p-1 hover:text-white", track.locked ? "text-amber-400" : "text-zinc-600")}
          aria-pressed={track.locked}
          title={track.locked ? "Destravar trilha" : "Travar trilha"}
        >
          {track.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
        </button>
        <button
          onClick={() => setTrackFlag(track.id, "hidden", !track.hidden)}
          className={cn("rounded px-1 py-0.5 text-[9px] hover:text-white", track.hidden ? "text-rose-400" : "text-zinc-600")}
          aria-pressed={track.hidden}
          title={track.hidden ? "Mostrar trilha" : "Ocultar trilha"}
        >
          {track.hidden ? "off" : "on"}
        </button>
      </span>
    </div>
  );
}
