"use client";

// Multi-track timeline: ruler, video clip (splits, in/out, removed segments),
// captions, audio waveform (deterministic SVG), layers — with zoom + playhead.

import { useMemo, useRef, type MouseEvent } from "react";
import { Captions, Film, Layers, Music2, Pause, Play, Scissors, SkipBack, ZoomIn, ZoomOut } from "lucide-react";
import { cn, formatDuration, seededRandom } from "@/lib/utils";
import { beatTimes, speedAt, TRANSITION_META } from "@/lib/edit-visuals";
import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";
import { groupSentences } from "./sentences";

// Altura das trilhas (px) — usada só na matemática do waveform SVG (o SVG
// escala com preserveAspectRatio="none", então basta manter a proporção). O
// tamanho visual dos rows vem das classes h-8 lg:h-9 (32px mobile / 36px
// desktop), compactas estilo CapCut para o vídeo ocupar o máximo de altura.
const TRACK_H = 36;
const TRACK_CLS = "h-8 lg:h-9";

export function EditorTimeline() {
  const {
    cut,
    doc,
    playing,
    currentTime,
    timelineZoom,
    togglePlay,
    seek,
    setTimelineZoom,
    splitAtPlayhead,
  } = useEditorStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  const duration = cut ? cut.endSeconds - cut.startSeconds : 0;
  const width = Math.max(300, duration * timelineZoom);

  const sentences = useMemo(() => (cut ? groupSentences(cut) : []), [cut]);

  // Deterministic fake waveform bars.
  const waveform = useMemo(() => {
    if (!cut) return [];
    const rnd = seededRandom(Math.round(cut.startSeconds * 7 + cut.endSeconds));
    const barCount = Math.max(60, Math.round(duration * 4));
    return Array.from({ length: barCount }, () => 0.15 + rnd() * 0.85);
  }, [cut, duration]);

  if (!cut) return null;

  function timeFromEvent(e: MouseEvent<HTMLDivElement>): number {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.min(duration, Math.max(0, x / timelineZoom));
  }

  // Marcadores de batida (beat sync) na trilha de áudio.
  const beats = doc.audioCapcut.beatSync ? beatTimes(doc.audioCapcut.bpm, duration) : [];

  const tickStep = timelineZoom >= 24 ? 1 : timelineZoom >= 10 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += tickStep) ticks.push(t);

  return (
    <div className="shrink-0 border-t border-line bg-surface-1/80">
      {/* Transport controls — desktop; no mobile a linha de transporte fica acima da timeline */}
      <div className="hidden items-center gap-2 px-4 py-1 lg:flex">
        <button
          onClick={() => seek(0)}
          aria-label="Voltar ao início"
          title="Voltar ao início"
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
          title={playing ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <button
          onClick={splitAtPlayhead}
          aria-label="Dividir no playhead (S)"
          title="Dividir no playhead (S)"
          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Scissors className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-zinc-400">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
        {doc.inPoint != null && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">IN {formatDuration(doc.inPoint)}</span>
        )}
        {doc.outPoint != null && (
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-mono text-rose-300">OUT {formatDuration(doc.outPoint)}</span>
        )}
        <div className="ml-auto flex w-44 items-center gap-2">
          <ZoomOut className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          <Slider value={timelineZoom} min={4} max={60} onChange={setTimelineZoom} aria-label="Zoom da timeline" />
          <ZoomIn className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        </div>
      </div>

      {/* Tracks */}
      <div className="flex">
        {/* Track labels (desktop) */}
        <div className="hidden w-24 shrink-0 border-r border-line text-[10px] font-medium uppercase tracking-wide text-zinc-500 lg:block">
          <div className="flex h-5 items-center px-3" aria-hidden />
          <div className={cn("flex items-center gap-1.5 px-3", TRACK_CLS)}>
            <Film className="h-3 w-3" aria-hidden /> Vídeo
          </div>
          <div className={cn("flex items-center gap-1.5 px-3", TRACK_CLS)}>
            <Captions className="h-3 w-3" aria-hidden /> Legendas
          </div>
          <div className={cn("flex items-center gap-1.5 px-3", TRACK_CLS)}>
            <Music2 className="h-3 w-3" aria-hidden /> Áudio
          </div>
          <div className={cn("flex items-center gap-1.5 px-3", TRACK_CLS)}>
            <Layers className="h-3 w-3" aria-hidden /> Camadas
          </div>
        </div>

        {/* Scrollable timeline */}
        <div ref={scrollRef} className="editor-scroll min-w-0 flex-1 overflow-x-auto pb-0.5 lg:pb-1">
          <div
            className="relative cursor-crosshair"
            style={{ width }}
            onClick={(e) => seek(timeFromEvent(e))}
            role="slider"
            aria-label="Linha do tempo — clique para posicionar o playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") seek(currentTime - 1);
              if (e.key === "ArrowRight") seek(currentTime + 1);
            }}
          >
            {/* Ruler */}
            <div className="relative h-5 border-b border-line">
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute top-0 flex h-full flex-col justify-between text-[9px] text-zinc-600"
                  style={{ left: t * timelineZoom }}
                >
                  <span className="pl-1">{formatDuration(t)}</span>
                  <span className="h-1.5 w-px bg-zinc-700" />
                </span>
              ))}
            </div>

            {/* Video track */}
            <div className={cn("relative border-b border-line/50", TRACK_CLS)}>
              <div className="absolute inset-1 overflow-hidden rounded-lg bg-gradient-to-r from-violet-800/60 to-fuchsia-800/40 ring-1 ring-inset ring-white/10">
                <div className="flex h-full items-center gap-1 px-2" aria-hidden>
                  {Array.from({ length: Math.max(3, Math.floor(width / 64)) }).map((_, i) => (
                    <span key={i} className="h-4 w-10 shrink-0 rounded-sm bg-black/30" />
                  ))}
                </div>
              </div>
              {/* removed sentence segments */}
              {sentences
                .filter((s) => doc.removedSentenceKeys.includes(s.key))
                .map((s) => (
                  <div
                    key={s.key}
                    title="Trecho removido (edição por texto)"
                    className="absolute inset-y-1 z-10 rounded-md bg-rose-600/50 ring-1 ring-rose-400/70 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.3)_4px,rgba(0,0,0,0.3)_8px)]"
                    style={{
                      left: (s.start - cut.startSeconds) * timelineZoom,
                      width: Math.max(4, (s.end - s.start) * timelineZoom),
                    }}
                  />
                ))}
              {/* splits + transitions */}
              {doc.splits.map((s) => {
                const tr = doc.transitions.find((t) => t.at === s);
                const meta = tr ? TRANSITION_META.find((m) => m.id === tr.type) : null;
                return (
                  <span key={s} className="absolute inset-y-0 z-10" style={{ left: s * timelineZoom }} title={meta ? `${meta.label} em ${formatDuration(s)}` : `Divisão em ${formatDuration(s)}`}>
                    <span className="absolute inset-y-0 w-0.5 bg-amber-300" />
                    {meta && (
                      <span className="absolute -top-0.5 -left-2 rounded bg-fuchsia-600/90 px-0.5 text-[8px] leading-tight text-white" aria-hidden>
                        {meta.emoji}
                      </span>
                    )}
                  </span>
                );
              })}
              {/* reframe keyframes */}
              {doc.reframe.keyframes.map((k) => (
                <span
                  key={`rf-${k.t}`}
                  className="absolute top-0.5 z-10 h-2 w-2 -translate-x-1/2 rotate-45 bg-fuchsia-400"
                  style={{ left: k.t * timelineZoom }}
                  title={`Reenquadrar ${k.zoom.toFixed(2)}x em ${formatDuration(k.t)}`}
                />
              ))}
              {/* speed keyframes + ramp */}
              {doc.speed.keyframes.length > 0 && (
                <svg className="pointer-events-none absolute inset-x-0 bottom-0 z-[9] h-3" width={width} height={12} aria-hidden preserveAspectRatio="none">
                  <polyline
                    points={Array.from({ length: Math.max(2, Math.round(width / 8)) }, (_, i) => {
                      const x = (i / Math.max(1, Math.round(width / 8) - 1)) * width;
                      const t = x / timelineZoom;
                      const rate = speedAt(doc.speed, t);
                      const y = 12 - ((rate - 0.25) / (4 - 0.25)) * 12;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(" ")}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                  />
                </svg>
              )}
              {doc.speed.keyframes.map((k) => (
                <span
                  key={`sp-${k.t}`}
                  className="absolute bottom-0.5 z-10 h-2 w-2 -translate-x-1/2 rotate-45 bg-amber-400"
                  style={{ left: k.t * timelineZoom }}
                  title={`${k.rate.toFixed(2)}x em ${formatDuration(k.t)}`}
                />
              ))}
              {/* in/out shading */}
              {doc.inPoint != null && (
                <div className="absolute inset-y-0 left-0 bg-black/50" style={{ width: doc.inPoint * timelineZoom }} aria-hidden />
              )}
              {doc.outPoint != null && (
                <div className="absolute inset-y-0 bg-black/50" style={{ left: doc.outPoint * timelineZoom, right: 0 }} aria-hidden />
              )}
            </div>

            {/* Captions track */}
            <div className={cn("relative border-b border-line/50", TRACK_CLS)}>
              {sentences.map((s) => (
                <div
                  key={s.key}
                  className={cn(
                    "absolute inset-y-1.5 flex items-center overflow-hidden whitespace-nowrap rounded-md px-1.5 text-[9px] ring-1 ring-inset",
                    doc.removedSentenceKeys.includes(s.key)
                      ? "bg-zinc-800/60 text-zinc-600 ring-zinc-700 line-through"
                      : "bg-sky-500/20 text-sky-200 ring-sky-400/30",
                  )}
                  style={{
                    left: (s.start - cut.startSeconds) * timelineZoom,
                    width: Math.max(8, (s.end - s.start) * timelineZoom - 2),
                  }}
                  title={s.text}
                >
                  {s.text}
                </div>
              ))}
            </div>

            {/* Audio track (waveform) */}
            <div className={cn("relative border-b border-line/50", TRACK_CLS)}>
              <svg viewBox={`0 0 ${width} ${TRACK_H}`} className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
                {waveform.map((v, i) => {
                  const x = (i / waveform.length) * width;
                  const h = v * (TRACK_H - 12);
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={(TRACK_H - h) / 2}
                      width={Math.max(1, width / waveform.length - 1)}
                      height={h}
                      rx={1}
                      className="fill-emerald-400/50"
                    />
                  );
                })}
              </svg>
              {/* fade in/out handles */}
              {doc.audioAdvanced.fadeInSec > 0 && (
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 z-10"
                  style={{ width: Math.min(width, doc.audioAdvanced.fadeInSec * timelineZoom), background: "linear-gradient(to right, rgba(0,0,0,0.7), transparent)" }}
                  title={`Fade in ${doc.audioAdvanced.fadeInSec.toFixed(1)}s`}
                  aria-hidden
                />
              )}
              {doc.audioAdvanced.fadeOutSec > 0 && (
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 z-10"
                  style={{ width: Math.min(width, doc.audioAdvanced.fadeOutSec * timelineZoom), background: "linear-gradient(to left, rgba(0,0,0,0.7), transparent)" }}
                  title={`Fade out ${doc.audioAdvanced.fadeOutSec.toFixed(1)}s`}
                  aria-hidden
                />
              )}
              {/* Beat markers (beat sync) */}
              {beats.map((b, i) => (
                <span
                  key={`beat-${i}`}
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-fuchsia-400/70"
                  style={{ left: b * timelineZoom }}
                  title={`Batida em ${formatDuration(b)}`}
                  aria-hidden
                />
              ))}
              {doc.audio.musicTrack && (
                <span className="absolute left-2 top-1 z-20 rounded bg-black/60 px-1.5 text-[9px] text-emerald-200">
                  🎵 {doc.audio.musicTrack}
                </span>
              )}
              {doc.audioCapcut.beatSync && (
                <span className="absolute right-2 top-1 z-20 rounded bg-fuchsia-500/20 px-1.5 text-[9px] font-medium text-fuchsia-200">
                  ♪ {beats.length} batidas
                </span>
              )}
            </div>

            {/* Layers track (desktop — no mobile a timeline segue o padrão CapCut: vídeo + legendas + áudio) */}
            <div className={cn("relative hidden lg:block", TRACK_CLS)}>
              {doc.layers.headlineEnabled && (
                <div className="absolute inset-y-1.5 left-0 flex items-center rounded-md bg-amber-500/20 px-1.5 text-[9px] text-amber-200 ring-1 ring-inset ring-amber-400/30" style={{ width: width * 0.35 }}>
                  Headline
                </div>
              )}
              {doc.layers.progressBarEnabled && (
                <div className="absolute inset-y-1.5 flex items-center rounded-md bg-violet-500/20 px-1.5 text-[9px] text-violet-200 ring-1 ring-inset ring-violet-400/30" style={{ left: 0, width }}>
                  Barra de progresso
                </div>
              )}
            </div>

            {/* Playhead */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-white"
              style={{ left: currentTime * timelineZoom }}
              aria-hidden
            >
              <span className="absolute -left-[5px] -top-0.5 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
