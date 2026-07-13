"use client";

// Timeline multitrilha — Fatia A: renderização READ-ONLY do modelo (clips
// posicionados por tempo→pixel), régua, playhead, seleção e zoom. As ações de
// arrastar/aparar/dividir entram nas próximas fatias; aqui a UI só lê o store e
// despacha seleção/playhead/zoom (view state).

import { useMemo } from "react";
import { Film, Music2, Type as TypeIcon, Sticker, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Track, TrackType } from "@/lib/video-editor/model";
import { clipEndMs, projectDurationMs, timeToPx } from "@/lib/video-editor/timeline-math";
import { useVideoEditor } from "@/store/video-editor";

const TRACK_H = 52;
const LABEL_W = 96;

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

export function TimelineTracks() {
  const project = useVideoEditor((s) => s.project);
  const pxPerSecond = useVideoEditor((s) => s.pxPerSecond);
  const playheadMs = useVideoEditor((s) => s.playheadMs);
  const selectedClipId = useVideoEditor((s) => s.selectedClipId);
  const setPlayhead = useVideoEditor((s) => s.setPlayhead);
  const setZoom = useVideoEditor((s) => s.setZoom);
  const select = useVideoEditor((s) => s.select);

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

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface-1/70">
      {/* barra de zoom */}
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-xs text-zinc-400">
          {fmt(playheadMs)} <span className="text-zinc-600">/ {fmt(projectDurationMs(project.tracks))}</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(pxPerSecond - 20)}
            aria-label="Diminuir zoom"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-14 text-center font-mono text-[11px] text-zinc-500">{pxPerSecond}px/s</span>
          <button
            onClick={() => setZoom(pxPerSecond + 20)}
            aria-label="Aumentar zoom"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex">
        {/* rótulos das trilhas */}
        <div className="shrink-0 border-r border-line" style={{ width: LABEL_W }}>
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
            <div className="relative cursor-crosshair" onClick={seekFromEvent} style={{ height: project.tracks.length * TRACK_H }}>
              {project.tracks.map((track, ti) => (
                <div key={track.id} className="absolute inset-x-0 border-b border-line/40" style={{ top: ti * TRACK_H, height: TRACK_H }}>
                  {track.clips.map((clip) => (
                    <button
                      key={clip.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        select(clip.id);
                      }}
                      className={cn(
                        "absolute inset-y-1.5 overflow-hidden rounded-md bg-gradient-to-r px-2 text-left text-[10px] font-medium text-white/90 ring-1 ring-inset transition-shadow",
                        TRACK_COLOR[track.type],
                        selectedClipId === clip.id ? "ring-2 ring-white shadow-glow" : "",
                        track.hidden && "opacity-40",
                      )}
                      style={{
                        left: timeToPx(clip.startInTimeline, pxPerSecond),
                        width: Math.max(6, timeToPx(clip.duration, pxPerSecond) - 2),
                      }}
                      title={`${fmt(clip.startInTimeline)} → ${fmt(clipEndMs(clip))}`}
                    >
                      <span className="pointer-events-none flex h-full items-center gap-1 truncate">
                        {clip.text?.content ?? clip.sourceId}
                        {clip.speed !== 1 && <span className="rounded bg-black/40 px-1 text-[8px]">{clip.speed}x</span>}
                      </span>
                    </button>
                  ))}
                </div>
              ))}

              {/* playhead */}
              <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-white" style={{ left: timeToPx(playheadMs, pxPerSecond) }}>
                <span className="absolute -left-[5px] -top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackLabel({ track }: { track: Track }) {
  const Icon = TRACK_ICON[track.type];
  const setTrackFlag = useVideoEditor((s) => s.setTrackFlag);
  return (
    <div className="flex items-center gap-1.5 border-b border-line/40 px-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500" style={{ height: TRACK_H }}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{track.name}</span>
      <button
        onClick={() => setTrackFlag(track.id, "hidden", !track.hidden)}
        className="ml-auto rounded px-1 text-[9px] text-zinc-600 hover:text-white"
        aria-pressed={track.hidden}
        title={track.hidden ? "Mostrar trilha" : "Ocultar trilha"}
      >
        {track.hidden ? "oculta" : "•"}
      </button>
    </div>
  );
}
