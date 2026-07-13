"use client";

// Preview composto: um canvas dimensionado à resolução do projeto, desenhando o
// frame da timeline no playhead via o motor (engine.drawComposite). Reproduz a
// trilha de vídeo primária tocando o <video> da fonte ativa e derivando o
// playhead do próprio elemento (tempo real, suave). Trilhas de texto/imagem são
// compostas por cima no mesmo instante.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { drawComposite, type Drawable } from "@/lib/video-editor/engine";
import type { Clip } from "@/lib/video-editor/model";
import { sourceObjectUrl, type MediaSource } from "@/lib/video-editor/media-registry";
import { clipAtTime, clipEndMs, projectDurationMs, sourceTimeForClip, tracksForRender } from "@/lib/video-editor/timeline-math";
import { useVideoEditor } from "@/store/video-editor";

function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export function PreviewStage() {
  const project = useVideoEditor((s) => s.project);
  const sources = useVideoEditor((s) => s.sources);
  const playheadMs = useVideoEditor((s) => s.playheadMs);
  const setPlayhead = useVideoEditor((s) => s.setPlayhead);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);

  const { w: pw, h: ph } = project.resolution;
  const durationMs = useMemo(() => projectDurationMs(project.tracks), [project.tracks]);

  // trilha de vídeo primária (a primeira visível)
  const primaryTrack = useMemo(() => tracksForRender(project.tracks).find((t) => t.type === "video") ?? null, [project.tracks]);

  // --- elementos de mídia -----------------------------------------------------
  const ensureVideo = useCallback(
    async (source: MediaSource): Promise<HTMLVideoElement | null> => {
      let el = videosRef.current.get(source.id);
      if (el) return el;
      const url = await sourceObjectUrl(source);
      if (!url) return null;
      el = document.createElement("video");
      el.muted = true;
      el.setAttribute("playsinline", "");
      el.preload = "auto";
      el.src = url;
      videosRef.current.set(source.id, el);
      return el;
    },
    [],
  );

  const ensureImage = useCallback(
    async (source: MediaSource): Promise<HTMLImageElement | null> => {
      let el = imagesRef.current.get(source.id);
      if (el) return el;
      const url = await sourceObjectUrl(source);
      if (!url) return null;
      el = new Image();
      el.src = url;
      imagesRef.current.set(source.id, el);
      return el;
    },
    [],
  );

  const ensureAudio = useCallback(async (source: MediaSource): Promise<HTMLAudioElement | null> => {
    let el = audiosRef.current.get(source.id);
    if (el) return el;
    const url = await sourceObjectUrl(source);
    if (!url) return null;
    el = document.createElement("audio");
    el.preload = "auto";
    el.src = url;
    audiosRef.current.set(source.id, el);
    return el;
  }, []);

  // pré-carrega os elementos das fontes usadas
  useEffect(() => {
    for (const source of Object.values(sources)) {
      if (source.kind === "video") void ensureVideo(source);
      else if (source.kind === "image") void ensureImage(source);
      else if (source.kind === "audio") void ensureAudio(source);
    }
  }, [sources, ensureVideo, ensureImage, ensureAudio]);

  // sincroniza as trilhas de ÁUDIO (música) ao playhead durante a reprodução
  const syncAudio = useCallback(
    (head: number, isPlaying: boolean) => {
      const activeBySource = new Map<string, { timeSec: number; speed: number }>();
      if (isPlaying) {
        for (const track of project.tracks) {
          if (track.type !== "audio" || track.muted || track.hidden) continue;
          const clip = clipAtTime(track, head);
          if (!clip) continue;
          activeBySource.set(clip.sourceId, { timeSec: sourceTimeForClip(clip, head) / 1000, speed: clip.speed });
        }
      }
      audiosRef.current.forEach((el, sourceId) => {
        const active = activeBySource.get(sourceId);
        if (active) {
          el.playbackRate = Math.min(4, Math.max(0.25, active.speed));
          if (Math.abs(el.currentTime - active.timeSec) > 0.25) el.currentTime = Math.max(0, active.timeSec);
          if (el.paused) void el.play().catch(() => undefined);
        } else if (!el.paused) {
          el.pause();
        }
      });
    },
    [project.tracks],
  );

  // resolvedor para o motor: devolve o elemento já apresentando o frame certo
  const resolve = useCallback(
    (clip: Clip): Drawable | null => {
      const source = sources[clip.sourceId];
      if (!source) return null;
      if (source.kind === "video") {
        const el = videosRef.current.get(source.id);
        if (!el || el.readyState < 2) return null;
        return { el, w: el.videoWidth, h: el.videoHeight };
      }
      if (source.kind === "image") {
        const el = imagesRef.current.get(source.id);
        if (!el || !el.complete || !el.naturalWidth) return null;
        return { el, w: el.naturalWidth, h: el.naturalHeight };
      }
      return null;
    },
    [sources],
  );

  // --- dimensionamento --------------------------------------------------------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setStageSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(() => {
    if (!stageSize) return { w: 320, h: 320 * (ph / pw) };
    const scale = Math.min(stageSize.w / pw, stageSize.h / ph);
    return { w: Math.max(80, Math.floor(pw * scale)), h: Math.max(80, Math.floor(ph * scale)) };
  }, [stageSize, pw, ph]);

  // --- desenho ----------------------------------------------------------------
  const draw = useCallback(
    (head: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawComposite(ctx, pw, ph, project, head, resolve);
    },
    [project, pw, ph, resolve],
  );

  // desenha ao mudar o playhead (scrubbing/seek) quando pausado
  useEffect(() => {
    if (playing) return;
    // sincroniza os vídeos ativos para o tempo do playhead e desenha
    let cancelled = false;
    (async () => {
      for (const track of tracksForRender(project.tracks)) {
        if (track.type !== "video") continue;
        const clip = clipAtTime(track, playheadMs);
        if (!clip) continue;
        const source = sources[clip.sourceId];
        if (!source || source.kind !== "video") continue;
        const el = await ensureVideo(source);
        if (!el) continue;
        const target = sourceTimeForClip(clip, playheadMs) / 1000;
        if (Math.abs(el.currentTime - target) > 0.05) {
          await seekVideo(el, target);
        }
      }
      if (!cancelled) draw(playheadMs);
    })();
    return () => {
      cancelled = true;
    };
  }, [playheadMs, playing, project.tracks, sources, ensureVideo, draw]);

  // --- reprodução (trilha primária) ------------------------------------------
  const play = useCallback(async () => {
    const st = useVideoEditor.getState();
    const head = st.playheadMs;
    const anyActive = st.project.tracks.some((t) => (t.type === "video" || t.type === "audio") && clipAtTime(t, head));
    if (!anyActive) {
      // nada sob o playhead → começa do clipe mais antigo (vídeo ou áudio)
      const starts = st.project.tracks.flatMap((t) => t.clips.map((c) => c.startInTimeline));
      if (starts.length === 0) return;
      setPlayhead(Math.min(...starts));
    }
    setPlaying(true);
  }, [setPlayhead]);

  useEffect(() => {
    if (!playing || !primaryTrack) return;
    let stopped = false;
    let currentClipId: string | null = null;
    let el: HTMLVideoElement | null = null;
    const audios = audiosRef.current;

    async function startClip(clip: Clip) {
      const source = sources[clip.sourceId];
      if (!source || source.kind !== "video") {
        // clipe sem vídeo (imagem): avança pelo relógio
        return;
      }
      el = await ensureVideo(source);
      if (!el) return;
      currentClipId = clip.id;
      el.muted = false; // ao reproduzir, o som original do vídeo toca junto da música
      el.playbackRate = Math.min(4, Math.max(0.25, clip.speed));
      const target = sourceTimeForClip(clip, useVideoEditor.getState().playheadMs) / 1000;
      if (Math.abs(el.currentTime - target) > 0.08) await seekVideo(el, target);
      await el.play().catch(() => undefined);
    }

    let lastTs = performance.now();
    function loop() {
      if (stopped) return;
      const now = performance.now();
      const dt = now - lastTs;
      lastTs = now;
      const head = useVideoEditor.getState().playheadMs;
      const clip = clipAtTime(primaryTrack!, head);
      const audioActive = project.tracks.some((t) => t.type === "audio" && !t.muted && clipAtTime(t, head));

      if (clip) {
        if (clip.id !== currentClipId) {
          if (el) el.pause();
          void startClip(clip);
        } else if (el && el.readyState >= 2) {
          // deriva o playhead do tempo real do vídeo
          const newHead = clip.startInTimeline + (el.currentTime * 1000 - clip.trimIn) / clip.speed;
          setPlayhead(newHead >= clipEndMs(clip) ? clipEndMs(clip) : newHead);
        }
      } else if (audioActive) {
        // sem vídeo sob o playhead, mas há música tocando → relógio de parede
        if (el) el.pause();
        currentClipId = null;
        setPlayhead(head + dt);
      } else {
        setPlaying(false);
        return;
      }

      const head2 = useVideoEditor.getState().playheadMs;
      syncAudio(head2, true);
      draw(head2);
      rafRef.current = requestAnimationFrame(loop);
    }

    // toca também trilhas de áudio quando NÃO há trilha de vídeo (só música)
    const first = clipAtTime(primaryTrack, useVideoEditor.getState().playheadMs);
    if (first) void startClip(first);
    else void ensureAudioStart();
    rafRef.current = requestAnimationFrame(loop);

    async function ensureAudioStart() {
      // pré-carrega os áudios ativos para começar sem atraso
      for (const track of project.tracks) {
        if (track.type !== "audio") continue;
        const clip = clipAtTime(track, useVideoEditor.getState().playheadMs);
        if (clip) await ensureAudio(sources[clip.sourceId] ?? ({} as MediaSource)).catch(() => null);
      }
    }

    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (el) el.pause();
      audios.forEach((a) => a.pause());
    };
  }, [playing, primaryTrack, sources, project.tracks, ensureVideo, ensureAudio, syncAudio, setPlayhead, draw]);

  function toggle() {
    if (playing) setPlaying(false);
    else void play();
  }

  const hasMedia = Object.keys(sources).length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-[#050508]">
        <canvas
          ref={canvasRef}
          width={pw}
          height={ph}
          style={{ width: fit.w, height: fit.h }}
          className="rounded-lg bg-black shadow-2xl"
        />
        {!hasMedia && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500">
            Importe uma mídia para começar o preview.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-line bg-surface-1/60 px-3 py-2">
        <button
          onClick={toggle}
          aria-label={playing ? "Pausar" : "Reproduzir"}
          disabled={!hasMedia}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <span className="font-mono text-xs tabular-nums text-zinc-400">
          {fmt(playheadMs)} <span className="text-zinc-600">/ {fmt(durationMs)}</span>
        </span>
      </div>
    </div>
  );
}

/** Aguarda o seek do vídeo (com timeout defensivo). */
function seekVideo(el: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("seeked", finish);
      resolve();
    };
    const timer = setTimeout(finish, 800);
    el.addEventListener("seeked", () => {
      clearTimeout(timer);
      finish();
    });
    try {
      el.currentTime = Math.max(0, timeSec);
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}
