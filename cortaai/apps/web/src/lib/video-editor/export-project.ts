// EXPORTAÇÃO MULTITRILHA 100% no navegador (WebCodecs).
//
// Renderiza o PROJETO inteiro frame a frame usando o MESMO motor do preview
// (engine.drawComposite) — todas as trilhas visíveis, transformações, filtros,
// animações e texto — e mixa TODO o áudio (som dos vídeos + trilhas de música)
// num OfflineAudioContext, respeitando posição na timeline, trim, velocidade e
// volume por clipe. Sem servidor, sem chave.

import { isExportSupported, pickCodecs, type ExportProgress, type ExportResult } from "@/lib/export-render";
import { getMedia } from "@/lib/media-store";
import { drawComposite, type Drawable } from "./engine";
import type { Clip, Project } from "./model";
import { clipAtTime, clipSourceSpan, projectDurationMs, sourceTimeForClip, tracksForRender } from "./timeline-math";
import type { MediaSource } from "./media-registry";

export type { ExportProgress, ExportResult };
export { isExportSupported };

export interface ProjectExportOptions {
  shortSide: number; // 720 | 1080
  fps: number; // 24 | 30 | 60
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

const MAX_EXPORT_MS = 20 * 60 * 1000; // trava de segurança (20 min)

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Exportação cancelada", "AbortError");
}

function evenDims(project: Project, shortSide: number): { width: number; height: number } {
  const { w, h } = project.resolution;
  const scale = shortSide / Math.min(w, h);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w * scale), height: even(h * scale) };
}

function slugFile(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "projeto"
  );
}

// ------------------------------------------------------------ mídia (elements)

async function sourceUrl(source: MediaSource): Promise<string | null> {
  const blob = await getMedia(source.mediaId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

function loadVideoEl(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.setAttribute("playsinline", "");
    const timer = setTimeout(() => resolve(null), 20_000);
    v.onloadeddata = () => {
      clearTimeout(timer);
      resolve(v);
    };
    v.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    v.src = url;
  });
}

function loadImageEl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 10_000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, 1500);
    v.addEventListener("seeked", () => {
      clearTimeout(timer);
      done();
    });
    try {
      v.currentTime = Math.max(0, t);
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

// ---------------------------------------------------------------- áudio (mix)

/**
 * Mixa todo o áudio do projeto (clipes de trilhas de áudio + som dos clipes de
 * vídeo) para 48kHz estéreo. Null = projeto sem áudio audível.
 */
async function mixProjectAudio(
  project: Project,
  sources: Record<string, MediaSource>,
  durationMs: number,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const jobs: { clip: Clip; source: MediaSource }[] = [];
  for (const track of project.tracks) {
    if (track.muted) continue;
    if (track.type !== "audio" && track.type !== "video") continue;
    for (const clip of track.clips) {
      if (clip.volume <= 0) continue;
      const source = sources[clip.sourceId];
      if (!source || (source.kind !== "audio" && source.kind !== "video")) continue;
      jobs.push({ clip, source });
    }
  }
  if (jobs.length === 0) return null;

  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC || typeof OfflineAudioContext === "undefined") return null;

  // decodifica cada fonte uma única vez
  const decoded = new Map<string, AudioBuffer>();
  const decodeCtx = new AC();
  try {
    for (const { source } of jobs) {
      throwIfAborted(signal);
      if (decoded.has(source.id)) continue;
      const blob = await getMedia(source.mediaId);
      if (!blob) continue;
      try {
        const buf = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
        decoded.set(source.id, buf);
      } catch {
        /* fonte sem trilha de áudio decodificável (ex.: vídeo mudo) */
      }
    }
  } finally {
    void decodeCtx.close().catch(() => undefined);
  }
  if (decoded.size === 0) return null;

  const sampleRate = 48000;
  const frames = Math.max(1, Math.ceil((durationMs / 1000) * sampleRate));
  const offline = new OfflineAudioContext(2, frames, sampleRate);

  // limiter no master: evita clipar quando várias trilhas somam alto
  const master = offline.createDynamicsCompressor();
  master.threshold.value = -6;
  master.knee.value = 4;
  master.ratio.value = 12;
  master.attack.value = 0.003;
  master.release.value = 0.25;
  master.connect(offline.destination);

  let scheduled = 0;
  for (const { clip, source } of jobs) {
    const buffer = decoded.get(source.id);
    if (!buffer) continue;
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.min(4, Math.max(0.25, clip.speed));
    const gain = offline.createGain();
    const vol = Math.min(1, Math.max(0, clip.volume));
    const startSec = clip.startInTimeline / 1000;
    const endSec = (clip.startInTimeline + clip.duration) / 1000;
    const fadeInSec = Math.min(clip.fadeInMs ?? 0, clip.duration) / 1000;
    const fadeOutSec = Math.min(clip.fadeOutMs ?? 0, clip.duration) / 1000;
    if (fadeInSec > 0) {
      gain.gain.setValueAtTime(0.0001, startSec);
      gain.gain.linearRampToValueAtTime(vol, startSec + fadeInSec);
    } else {
      gain.gain.setValueAtTime(vol, startSec);
    }
    if (fadeOutSec > 0) {
      gain.gain.setValueAtTime(vol, Math.max(startSec, endSec - fadeOutSec));
      gain.gain.linearRampToValueAtTime(0.0001, endSec);
    }
    src.connect(gain).connect(master);
    const when = clip.startInTimeline / 1000;
    const offset = clip.trimIn / 1000;
    const srcSpanSec = clipSourceSpan(clip) / 1000;
    const maxAvail = Math.max(0.01, buffer.duration - offset);
    src.start(when, Math.min(offset, Math.max(0, buffer.duration - 0.01)), Math.min(srcSpanSec + 0.05, maxAvail));
    scheduled++;
  }
  if (scheduled === 0) return null;
  return await offline.startRendering();
}

// ------------------------------------------------------------- pipeline final

export async function renderProjectToBlob(
  project: Project,
  sources: Record<string, MediaSource>,
  opts: ProjectExportOptions,
): Promise<ExportResult> {
  if (!isExportSupported()) throw new Error("Este navegador não suporta renderização local (WebCodecs)");
  const report = (pct: number, message: string) =>
    opts.onProgress?.({ pct: Math.max(0, Math.min(100, Math.round(pct))), message });

  const durationMs = Math.min(MAX_EXPORT_MS, projectDurationMs(project.tracks));
  if (durationMs < 200) throw new Error("O projeto está vazio — adicione clipes à timeline");
  const { width, height } = evenDims(project, opts.shortSide);
  const fps = opts.fps;
  const totalFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));

  // --- carrega os elementos visuais usados -----------------------------------
  report(1, "Carregando as mídias…");
  const videoEls = new Map<string, HTMLVideoElement>();
  const imageEls = new Map<string, HTMLImageElement>();
  const ownedUrls: string[] = [];
  const renderTracks = tracksForRender(project.tracks);
  for (const track of renderTracks) {
    for (const clip of track.clips) {
      throwIfAborted(opts.signal);
      const source = sources[clip.sourceId];
      if (!source) continue;
      if (source.kind === "video" && !videoEls.has(source.id)) {
        const url = await sourceUrl(source);
        if (!url) continue;
        ownedUrls.push(url);
        const el = await loadVideoEl(url);
        if (el) videoEls.set(source.id, el);
      } else if (source.kind === "image" && !imageEls.has(source.id)) {
        const url = await sourceUrl(source);
        if (!url) continue;
        ownedUrls.push(url);
        const el = await loadImageEl(url);
        if (el) imageEls.set(source.id, el);
      }
    }
  }

  const resolve = (clip: Clip): Drawable | null => {
    const source = sources[clip.sourceId];
    if (!source) return null;
    if (source.kind === "video") {
      const el = videoEls.get(source.id);
      if (!el || el.readyState < 2) return null;
      return { el, w: el.videoWidth, h: el.videoHeight };
    }
    if (source.kind === "image") {
      const el = imageEls.get(source.id);
      if (!el || !el.naturalWidth) return null;
      return { el, w: el.naturalWidth, h: el.naturalHeight };
    }
    return null;
  };

  // --- áudio ------------------------------------------------------------------
  report(4, "Mixando o áudio (vídeos + música)…");
  const audioBuffer = await mixProjectAudio(project, sources, durationMs, opts.signal);
  throwIfAborted(opts.signal);

  report(6, "Escolhendo o codec…");
  const plan = await pickCodecs(width, height, audioBuffer != null);

  // --- muxer + encoders ---------------------------------------------------------
  let finalizeAndGetBuffer: () => ArrayBuffer;
  let addVideoChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
  let addAudioChunk: ((chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void) | null = null;

  if (plan.container === "mp4") {
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width, height },
      ...(plan.audioCodec ? { audio: { codec: "aac", sampleRate: 48000, numberOfChannels: 2 } } : {}),
      fastStart: "in-memory",
    });
    addVideoChunk = (c, m) => muxer.addVideoChunk(c, m);
    if (plan.audioCodec) addAudioChunk = (c, m) => muxer.addAudioChunk(c, m);
    finalizeAndGetBuffer = () => {
      muxer.finalize();
      return target.buffer;
    };
  } else {
    const { Muxer, ArrayBufferTarget } = await import("webm-muxer");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: plan.videoCodec.startsWith("vp09") ? "V_VP9" : "V_VP8", width, height, frameRate: fps },
      ...(plan.audioCodec ? { audio: { codec: "A_OPUS", sampleRate: 48000, numberOfChannels: 2 } } : {}),
    });
    addVideoChunk = (c, m) => muxer.addVideoChunk(c, m);
    if (plan.audioCodec) addAudioChunk = (c, m) => muxer.addAudioChunk(c, m);
    finalizeAndGetBuffer = () => {
      muxer.finalize();
      return target.buffer as ArrayBuffer;
    };
  }

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  videoEncoder.configure({
    codec: plan.videoCodec,
    width,
    height,
    bitrate: Math.min(12_000_000, Math.round(width * height * fps * 0.12)),
    framerate: fps,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioBuffer && plan.audioCodec && addAudioChunk) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => addAudioChunk!(chunk, meta),
      error: (e) => {
        encodeError = e;
      },
    });
    audioEncoder.configure({ codec: plan.audioCodec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 });
  }

  // --- loop de vídeo --------------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");

  for (let i = 0; i < totalFrames; i++) {
    throwIfAborted(opts.signal);
    if (encodeError) throw encodeError;
    const tMs = (i / fps) * 1000;

    // posiciona cada vídeo ativo no frame-fonte correto
    for (const track of renderTracks) {
      if (track.type !== "video") continue;
      const clip = clipAtTime(track, tMs);
      if (!clip) continue;
      const source = sources[clip.sourceId];
      if (!source || source.kind !== "video") continue;
      const el = videoEls.get(source.id);
      if (!el) continue;
      const target = sourceTimeForClip(clip, tMs) / 1000;
      if (Math.abs(el.currentTime - target) > 1 / (fps * 2)) {
        await seekTo(el, target);
      }
    }

    drawComposite(ctx, width, height, project, tMs, resolve);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (videoEncoder.encodeQueueSize > 3) {
      await new Promise((r) => setTimeout(r, 4));
      if (encodeError) throw encodeError;
    }
    if (i % 5 === 0 || i === totalFrames - 1) {
      report(8 + (i / totalFrames) * 74, `Renderizando quadro ${i + 1} de ${totalFrames}…`);
    }
  }

  // --- áudio ------------------------------------------------------------------------
  if (audioBuffer && audioEncoder) {
    report(84, "Codificando o áudio…");
    const chunkFrames = 1024;
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
    for (let offset = 0; offset < audioBuffer.length; offset += chunkFrames) {
      throwIfAborted(opts.signal);
      if (encodeError) throw encodeError;
      const len = Math.min(chunkFrames, audioBuffer.length - offset);
      const interleaved = new Float32Array(len * 2);
      for (let j = 0; j < len; j++) {
        interleaved[j * 2] = ch0[offset + j];
        interleaved[j * 2 + 1] = ch1[offset + j];
      }
      const data = new AudioData({
        format: "f32",
        sampleRate: 48000,
        numberOfFrames: len,
        numberOfChannels: 2,
        timestamp: Math.round((offset / 48000) * 1e6),
        data: interleaved,
      });
      audioEncoder.encode(data);
      data.close();
      while (audioEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 4));
      }
    }
  }

  report(92, "Finalizando o arquivo…");
  await videoEncoder.flush();
  videoEncoder.close();
  if (audioEncoder) {
    await audioEncoder.flush();
    audioEncoder.close();
  }
  if (encodeError) throw encodeError;
  const buffer = finalizeAndGetBuffer();

  // limpeza
  for (const url of ownedUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  videoEls.forEach((v) => {
    v.removeAttribute("src");
    try {
      v.load();
    } catch {
      /* ignore */
    }
  });

  report(100, "Exportação concluída");
  return {
    blob: new Blob([buffer], { type: plan.mimeType }),
    mimeType: plan.mimeType,
    fileName: `${slugFile(project.name)}.${plan.ext}`,
  };
}
