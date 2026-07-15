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

export type ExportFormat = "video" | "gif" | "png-seq" | "mp3" | "wav";

export interface ProjectExportOptions {
  shortSide: number; // 720 | 1080 | 1440 | 2160 | 4320
  fps: number; // 24 | 30 | 60
  format?: ExportFormat; // padrão: video
  /** Contêiner do vídeo: "auto" escolhe o melhor; "mp4"/"webm" forçam a extensão. */
  container?: "auto" | "mp4" | "webm";
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
    // tratamentos de áudio (DSP): redução de ruído básica e realce de voz
    let head: AudioNode = src;
    if (clip.audioFx?.denoise) {
      const hp = offline.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 100; // corta ronco/vibração
      const lp = offline.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 7500; // corta chiado agudo
      head.connect(hp);
      hp.connect(lp);
      head = lp;
    }
    if (clip.audioFx?.voice) {
      const hp = offline.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 120;
      const presence = offline.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 3000;
      presence.Q.value = 1;
      presence.gain.value = 5; // presença/clareza da fala
      const comp = offline.createDynamicsCompressor();
      comp.threshold.value = -28;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.15;
      head.connect(hp);
      hp.connect(presence);
      presence.connect(comp);
      head = comp;
    }
    // equalizador de 3 bandas (opcional) entre a fonte e o ganho
    if (clip.eq) {
      const low = offline.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 250;
      low.gain.value = clip.eq.low;
      const mid = offline.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1200;
      mid.Q.value = 0.9;
      mid.gain.value = clip.eq.mid;
      const high = offline.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 4000;
      high.gain.value = clip.eq.high;
      head.connect(low);
      low.connect(mid);
      mid.connect(high);
      head = high;
    }
    head.connect(gain).connect(master);
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

  // --- exportação SÓ DE ÁUDIO (MP3/WAV) — sem pipeline de vídeo -----------------
  if (opts.format === "mp3" || opts.format === "wav") {
    report(5, "Mixando o áudio do projeto…");
    const audio = await mixProjectAudio(project, sources, durationMs, opts.signal);
    if (!audio) throw new Error("O projeto não tem áudio para exportar — adicione um clipe com som");
    throwIfAborted(opts.signal);
    if (opts.format === "wav") {
      report(70, "Gerando WAV…");
      const blob = audioBufferToWav(audio);
      report(100, "Concluído.");
      return { blob, mimeType: "audio/wav", fileName: `${slugFile(project.name)}.wav` };
    }
    const blob = await audioBufferToMp3(audio, opts.signal, (p) => report(30 + p * 0.68, "Codificando MP3…"));
    report(100, "Concluído.");
    return { blob, mimeType: "audio/mpeg", fileName: `${slugFile(project.name)}.mp3` };
  }

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

  // canvas de composição (compartilhado por todos os formatos)
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: opts.format === "gif" });
  if (!ctx) throw new Error("Canvas 2D indisponível");

  // posiciona os vídeos ativos no frame-fonte certo e compõe o quadro `i`
  const drawFrameAt = async (i: number): Promise<void> => {
    const tMs = (i / fps) * 1000;
    for (const track of renderTracks) {
      if (track.type !== "video") continue;
      const clip = clipAtTime(track, tMs);
      if (!clip) continue;
      const source = sources[clip.sourceId];
      if (!source || source.kind !== "video") continue;
      const el = videoEls.get(source.id);
      if (!el) continue;
      const target = sourceTimeForClip(clip, tMs) / 1000;
      if (Math.abs(el.currentTime - target) > 1 / (fps * 2)) await seekTo(el, target);
    }
    drawComposite(ctx, width, height, project, tMs, resolve);
  };

  const cleanup = () => {
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
  };

  // --- formatos SEM áudio: GIF e sequência PNG (.zip) -------------------------
  if (opts.format === "gif" || opts.format === "png-seq") {
    const result = await exportFramesOnly(opts.format, {
      totalFrames,
      fps,
      width,
      height,
      canvas,
      ctx,
      drawFrameAt,
      projectName: project.name,
      report,
      signal: opts.signal,
    });
    cleanup();
    report(100, "Exportação concluída");
    return result;
  }

  // --- áudio ------------------------------------------------------------------
  report(4, "Mixando o áudio (vídeos + música)…");
  const audioBuffer = await mixProjectAudio(project, sources, durationMs, opts.signal);
  throwIfAborted(opts.signal);

  report(6, "Escolhendo o codec…");
  const plan = await pickCodecs(width, height, audioBuffer != null, opts.container);

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
    bitrate: Math.min(80_000_000, Math.round(width * height * fps * 0.12)),
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
  for (let i = 0; i < totalFrames; i++) {
    throwIfAborted(opts.signal);
    if (encodeError) throw encodeError;
    await drawFrameAt(i);
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

  cleanup();
  report(100, "Exportação concluída");
  return {
    blob: new Blob([buffer], { type: plan.mimeType }),
    mimeType: plan.mimeType,
    fileName: `${slugFile(project.name)}.${plan.ext}`,
  };
}

// ------------------------------------------------- GIF / sequência PNG (.zip)

interface FramesOnlyCtx {
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  drawFrameAt: (i: number) => Promise<void>;
  projectName: string;
  report: (pct: number, message: string) => void;
  signal?: AbortSignal;
}

async function exportFramesOnly(format: "gif" | "png-seq", c: FramesOnlyCtx): Promise<ExportResult> {
  const { totalFrames, fps, width, height, canvas, ctx, drawFrameAt, projectName, report, signal } = c;
  const base = slugFile(projectName);

  if (format === "gif") {
    // GIF pesa muito em alta resolução → limita o lado maior a 480px e ~15fps.
    const gifScale = Math.min(1, 480 / Math.max(width, height));
    const gw = Math.max(2, Math.round(width * gifScale));
    const gh = Math.max(2, Math.round(height * gifScale));
    const step = Math.max(1, Math.round(fps / 15)); // amostra ~15fps
    const gifCanvas = document.createElement("canvas");
    gifCanvas.width = gw;
    gifCanvas.height = gh;
    const gctx = gifCanvas.getContext("2d", { willReadFrequently: true });
    if (!gctx) throw new Error("Canvas 2D indisponível");

    const { encodeGif } = await import("./gif");
    const frames: { data: Uint8ClampedArray; width: number; height: number }[] = [];
    for (let i = 0; i < totalFrames; i += step) {
      throwIfAborted(signal);
      await drawFrameAt(i);
      gctx.drawImage(canvas, 0, 0, gw, gh);
      const img = gctx.getImageData(0, 0, gw, gh);
      frames.push({ data: img.data, width: gw, height: gh });
      report(6 + (i / totalFrames) * 80, `Capturando quadro ${i + 1} de ${totalFrames}…`);
    }
    report(88, "Montando o GIF…");
    const blob = encodeGif(frames, (step / fps) * 1000, true);
    return { blob, mimeType: "image/gif", fileName: `${base}.gif` };
  }

  // sequência PNG dentro de um .zip
  const { makeZip, dataUrlToBytes } = await import("./zip");
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < totalFrames; i++) {
    throwIfAborted(signal);
    await drawFrameAt(i);
    const dataUrl = canvas.toDataURL("image/png");
    files.push({ name: `${base}_${String(i + 1).padStart(5, "0")}.png`, data: dataUrlToBytes(dataUrl) });
    report(6 + (i / totalFrames) * 84, `Renderizando PNG ${i + 1} de ${totalFrames}…`);
  }
  report(92, "Compactando o .zip…");
  const blob = makeZip(files);
  void ctx;
  return { blob, mimeType: "application/zip", fileName: `${base}_png.zip` };
}

// ---------------------------------------------------------- áudio: WAV e MP3

/** Codifica um AudioBuffer em WAV PCM 16-bit (estéreo intercalado). */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const sampleRate = buffer.sampleRate;
  const dataLen = frames * channels * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  const ch0 = buffer.getChannelData(0);
  const ch1 = channels > 1 ? buffer.getChannelData(1) : ch0;
  let off = 44;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, ch0[i]));
    const r = Math.max(-1, Math.min(1, ch1[i]));
    view.setInt16(off, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(off + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    off += 4;
  }
  return new Blob([view], { type: "audio/wav" });
}

/** Codifica um AudioBuffer em MP3 192 kbps (lamejs, 100% no navegador). */
async function audioBufferToMp3(
  buffer: AudioBuffer,
  signal?: AbortSignal,
  onPct?: (pct01to100: number) => void,
): Promise<Blob> {
  const lame = await import("@breezystack/lamejs");
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

  // Float32 → Int16 (o encoder trabalha em PCM 16-bit)
  const left = new Int16Array(frames);
  const right = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, ch0[i]));
    const r = Math.max(-1, Math.min(1, ch1[i]));
    left[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
    right[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
  }

  const encoder = new lame.Mp3Encoder(2, sampleRate, 192);
  const CHUNK = 1152; // tamanho de frame do MP3
  const parts: Uint8Array[] = [];
  for (let i = 0; i < frames; i += CHUNK) {
    throwIfAborted(signal);
    const out = encoder.encodeBuffer(left.subarray(i, i + CHUNK), right.subarray(i, i + CHUNK));
    if (out.length > 0) parts.push(new Uint8Array(out));
    if (i % (CHUNK * 200) === 0) {
      onPct?.(Math.round((i / frames) * 100));
      // deixa a UI respirar em projetos longos
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail));
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}
