// REAL in-browser media analysis (100% client-side, static-export safe).
//
// Extracts an AnalysisProfile from a video Blob (IndexedDB upload) or a direct
// URL using only web APIs — no backend, no new dependencies:
//
//  - Audio energy curve: WebAudio decodeAudioData → RMS per 0.5s window,
//    normalized 0..1. From it we derive PEAKS (local maxima above the ~70th
//    percentile = exciting moments) and SILENCES (below the ~15th percentile
//    for >= 0.8s = natural cut points).
//  - Scene changes: hidden <video> + 64×36 canvas sampling (1s stride for
//    videos <= 5 min, adaptive stride for longer, capped at ~120 samples).
//    RGB-histogram distance between consecutive frames above a dynamic
//    threshold = scene boundary.
//
// Every signal degrades gracefully (no audio track, decode error, tainted
// cross-origin canvas → that signal comes back empty; callers can blend the
// synthetic fallback). Cancelable via AbortSignal and memory-safe: object URLs
// revoked, AudioContext closed, <video> unloaded.

import { seededRandom } from "./utils";

export interface AnalysisProgress {
  /** 0-100 across the whole analysis. */
  pct: number;
  /** pt-BR status message shown in the generation UI. */
  message: string;
}

export interface AnalysisProfile {
  /** Media duration in seconds (best effort across audio/video metadata). */
  duration: number;
  /** Size of each energy window in seconds (0.5). */
  windowSeconds: number;
  /** Normalized (0..1) RMS energy, one value per window. Empty = no audio. */
  energy: number[];
  /** Seconds of energy peaks (exciting moments). */
  peaks: number[];
  /** [start, end] second ranges of detected silences (natural cut points). */
  silences: Array<[number, number]>;
  /** Seconds of detected scene boundaries. */
  scenes: number[];
  /** Raw per-sample histogram distances (for variance-based ranking). */
  sceneSamples: Array<{ t: number; diff: number }>;
  /** Whether a decodable audio track with real signal was found. */
  hasAudio: boolean;
  /** True when the profile was simulated (media not analyzable). */
  synthetic: boolean;
  /** Tiny JPEG data-URL thumbs sampled during scene detection. */
  sampledThumbs?: string[];
}

const WINDOW_SECONDS = 0.5;
/** Decoding audio needs the whole file in memory — skip beyond this size. */
const MAX_AUDIO_BYTES = 300 * 1024 * 1024;
const MAX_SCENE_SAMPLES = 120;
const THUMB_W = 64;
const THUMB_H = 36;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Análise cancelada", "AbortError");
}

/** Yield to the event loop so long loops never freeze the UI. */
function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

// ---------------------------------------------------------------- audio energy

interface AudioAnalysis {
  energy: number[];
  duration: number;
  hasAudio: boolean;
}

async function analyzeAudio(
  buffer: ArrayBuffer,
  onPct: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<AudioAnalysis> {
  const empty: AudioAnalysis = { energy: [], duration: 0, hasAudio: false };
  if (typeof window === "undefined") return empty;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return empty;
  let ctx: AudioContext | null = null;
  try {
    ctx = new Ctor();
    const audio = await ctx.decodeAudioData(buffer);
    const win = Math.max(1, Math.round(audio.sampleRate * WINDOW_SECONDS));
    const n = Math.max(1, Math.ceil(audio.length / win));
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) channels.push(audio.getChannelData(c));
    if (channels.length === 0) return { ...empty, duration: audio.duration };

    const energy = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const start = i * win;
      const end = Math.min(audio.length, start + win);
      let sum = 0;
      for (const ch of channels) {
        for (let j = start; j < end; j++) {
          const v = ch[j];
          sum += v * v;
        }
      }
      const count = Math.max(1, (end - start) * channels.length);
      energy[i] = Math.sqrt(sum / count);
      if (i % 48 === 47) {
        onPct(i / n);
        await yieldToUi();
        throwIfAborted(signal);
      }
    }
    let max = 0;
    for (const e of energy) if (e > max) max = e;
    if (max <= 0.0015) return { energy: [], duration: audio.duration, hasAudio: false };
    return { energy: energy.map((e) => e / max), duration: audio.duration, hasAudio: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return empty; // container without decodable audio, decode error, etc.
  } finally {
    if (ctx) void ctx.close().catch(() => undefined);
  }
}

/** Local maxima above the ~70th percentile, at least 2s apart. */
export function detectPeaks(energy: number[], windowSeconds = WINDOW_SECONDS): number[] {
  if (energy.length < 3) return [];
  const threshold = Math.max(percentile(energy, 0.7), 0.08);
  const minGapWindows = Math.max(1, Math.round(2 / windowSeconds));
  const peaks: Array<{ i: number; e: number }> = [];
  for (let i = 1; i < energy.length - 1; i++) {
    const e = energy[i];
    if (e < threshold || e < energy[i - 1] || e < energy[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last && i - last.i < minGapWindows) {
      if (e > last.e) peaks[peaks.length - 1] = { i, e };
      continue;
    }
    peaks.push({ i, e });
  }
  return peaks.map((p) => Math.round((p.i + 0.5) * windowSeconds * 10) / 10);
}

/** Runs below the ~15th percentile lasting >= 0.8s → [start, end] seconds. */
export function detectSilences(
  energy: number[],
  windowSeconds = WINDOW_SECONDS,
): Array<[number, number]> {
  if (energy.length < 3) return [];
  const threshold = Math.max(percentile(energy, 0.15), 0.035);
  const minWindows = Math.max(1, Math.ceil(0.8 / windowSeconds));
  const out: Array<[number, number]> = [];
  let runStart = -1;
  for (let i = 0; i <= energy.length; i++) {
    const quiet = i < energy.length && energy[i] <= threshold;
    if (quiet && runStart < 0) runStart = i;
    if (!quiet && runStart >= 0) {
      if (i - runStart >= minWindows) {
        out.push([
          Math.round(runStart * windowSeconds * 10) / 10,
          Math.round(i * windowSeconds * 10) / 10,
        ]);
      }
      runStart = -1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- scene changes

interface SceneAnalysis {
  duration: number;
  scenes: number[];
  samples: Array<{ t: number; diff: number }>;
  thumbs: string[];
}

function waitVideoMetadata(video: HTMLVideoElement, timeoutMs = 12000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(true);
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(false);
    };
  });
}

function seekTo(video: HTMLVideoElement, t: number, timeoutMs = 1600): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    video.addEventListener("seeked", finish);
    try {
      const max = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : t;
      video.currentTime = Math.min(Math.max(0, t), max);
    } catch {
      finish();
    }
  });
}

/** 4×4×4 RGB joint histogram, normalized to sum 1. */
function rgbHistogram(data: Uint8ClampedArray): Float32Array {
  const hist = new Float32Array(64);
  const px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] >> 6;
    const g = data[i + 1] >> 6;
    const b = data[i + 2] >> 6;
    hist[(r << 4) | (g << 2) | b] += 1;
  }
  for (let i = 0; i < 64; i++) hist[i] /= px;
  return hist;
}

/** Total-variation distance between two normalized histograms (0..1). */
function histDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / 2;
}

async function analyzeScenes(
  src: string,
  onPct: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<SceneAnalysis> {
  const empty: SceneAnalysis = { duration: 0, scenes: [], samples: [], thumbs: [] };
  if (typeof document === "undefined") return empty;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.setAttribute("playsinline", "");
  try {
    video.src = src;
    const ok = await waitVideoMetadata(video);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!ok || duration <= 0 || !video.videoWidth) return { ...empty, duration };

    const stride = duration <= 300 ? 1 : duration / MAX_SCENE_SAMPLES;
    const times: number[] = [];
    for (let t = Math.min(0.15, duration / 2); t < duration && times.length < MAX_SCENE_SAMPLES; t += stride) {
      times.push(t);
    }
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ...empty, duration };

    const samples: Array<{ t: number; diff: number }> = [];
    const thumbs: string[] = [];
    const thumbEvery = Math.max(1, Math.ceil(times.length / 6));
    let prev: Float32Array | null = null;
    for (let i = 0; i < times.length; i++) {
      throwIfAborted(signal);
      const t = times[i];
      await seekTo(video, t);
      let hist: Float32Array;
      try {
        ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
        hist = rgbHistogram(ctx.getImageData(0, 0, THUMB_W, THUMB_H).data);
      } catch {
        break; // tainted cross-origin canvas — scene signal unavailable
      }
      if (prev) samples.push({ t: Math.round(t * 10) / 10, diff: histDistance(prev, hist) });
      if (i % thumbEvery === 0 && thumbs.length < 6) {
        try {
          thumbs.push(canvas.toDataURL("image/jpeg", 0.55));
        } catch {
          /* tainted — skip thumbs */
        }
      }
      prev = hist;
      onPct((i + 1) / times.length);
      if (i % 8 === 7) await yieldToUi();
    }

    // Dynamic threshold: clearly above the video's own motion baseline.
    const diffs = samples.map((s) => s.diff);
    const threshold = Math.max(0.24, percentile(diffs, 0.82) + 0.04);
    const scenes = samples.filter((s) => s.diff >= threshold).map((s) => s.t);
    return { duration, scenes, samples, thumbs };
  } finally {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------- entry points

export interface AnalyzeOptions {
  onProgress?: (p: AnalysisProgress) => void;
  signal?: AbortSignal;
  /** Known duration (seconds) used as fallback when metadata fails. */
  durationHint?: number;
}

/**
 * Analyze a media Blob or direct URL. Always resolves with a (possibly
 * partially empty) profile — only an AbortSignal cancel rejects.
 */
export async function analyzeMedia(
  source: Blob | string,
  opts: AnalyzeOptions = {},
): Promise<AnalysisProfile> {
  const { onProgress, signal } = opts;
  const report = (pct: number, message: string) =>
    onProgress?.({ pct: Math.max(0, Math.min(100, Math.round(pct))), message });

  let ownedUrl: string | null = null;
  const src =
    typeof source === "string"
      ? source
      : (ownedUrl = typeof URL !== "undefined" ? URL.createObjectURL(source) : null) ?? "";
  try {
    throwIfAborted(signal);
    report(2, "Analisando áudio…");

    // Audio needs the raw bytes; direct URLs are fetched (CORS permitting).
    let buffer: ArrayBuffer | null = null;
    try {
      if (typeof source !== "string") {
        if (source.size > 0 && source.size <= MAX_AUDIO_BYTES) buffer = await source.arrayBuffer();
      } else {
        const res = await fetch(source, { signal });
        if (res.ok) {
          const len = Number(res.headers.get("content-length") ?? 0);
          if (!len || len <= MAX_AUDIO_BYTES) buffer = await res.arrayBuffer();
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      buffer = null; // opaque/cross-origin/oversized — audio signal unavailable
    }
    throwIfAborted(signal);

    const audio = buffer
      ? await analyzeAudio(buffer, (f) => report(4 + f * 44, "Analisando áudio…"), signal)
      : { energy: [], duration: 0, hasAudio: false };
    throwIfAborted(signal);

    report(50, "Detectando cenas…");
    const scenesRes = src
      ? await analyzeScenes(src, (f) => report(50 + f * 46, "Detectando cenas…"), signal)
      : { duration: 0, scenes: [], samples: [], thumbs: [] };
    throwIfAborted(signal);

    const duration = Math.max(audio.duration, scenesRes.duration, opts.durationHint ?? 0);
    report(97, "Escolhendo os melhores momentos…");
    return {
      duration: Math.round(duration * 100) / 100,
      windowSeconds: WINDOW_SECONDS,
      energy: audio.energy,
      peaks: detectPeaks(audio.energy),
      silences: detectSilences(audio.energy),
      scenes: scenesRes.scenes,
      sceneSamples: scenesRes.samples,
      hasAudio: audio.hasAudio,
      synthetic: false,
      sampledThumbs: scenesRes.thumbs.length ? scenesRes.thumbs : undefined,
    };
  } finally {
    if (ownedUrl) {
      try {
        URL.revokeObjectURL(ownedUrl);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Deterministic simulated profile for projects whose media cannot be analyzed
 * in the browser (e.g. platform imports that require the backend). The curve is
 * plausible (waves + noise + injected quiet valleys) and NEVER uniform, so the
 * segment selection still produces varied, irregular cuts. Flagged as
 * `synthetic: true` so the UI stays honest about it.
 */
export function syntheticProfile(durationSeconds: number, seed: number): AnalysisProfile {
  const duration = durationSeconds > 0 ? durationSeconds : 480;
  const rnd = seededRandom(Math.max(1, Math.round(seed)));
  const n = Math.max(8, Math.ceil(duration / WINDOW_SECONDS));
  const f1 = 0.04 + rnd() * 0.05;
  const f2 = 0.11 + rnd() * 0.09;
  const p1 = rnd() * Math.PI * 2;
  const p2 = rnd() * Math.PI * 2;
  let walk = 0;
  const energy = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    walk = Math.max(-0.22, Math.min(0.22, walk + (rnd() - 0.5) * 0.09));
    const v = 0.5 + 0.24 * Math.sin(i * f1 + p1) + 0.16 * Math.sin(i * f2 + p2) + walk + (rnd() - 0.5) * 0.08;
    energy[i] = Math.max(0.02, Math.min(1, v));
  }
  // Quiet valleys (breathing pauses) every ~20-45s, lasting ~1-1.6s.
  let t = 12 + rnd() * 18;
  while (t < duration - 4) {
    const startW = Math.floor(t / WINDOW_SECONDS);
    const lenW = 2 + Math.round(rnd() * 2);
    for (let j = startW; j < Math.min(n, startW + lenW); j++) energy[j] = 0.015 + rnd() * 0.02;
    t += 20 + rnd() * 25;
  }
  // Scene boundaries at irregular 8-26s intervals.
  const scenes: number[] = [];
  let s = 5 + rnd() * 10;
  while (s < duration - 3) {
    scenes.push(Math.round(s * 10) / 10);
    s += 8 + rnd() * 18;
  }
  return {
    duration: Math.round(duration * 100) / 100,
    windowSeconds: WINDOW_SECONDS,
    energy,
    peaks: detectPeaks(energy),
    silences: detectSilences(energy),
    scenes,
    sceneSamples: scenes.map((sc) => ({ t: sc, diff: 0.3 + rnd() * 0.4 })),
    hasAudio: false,
    synthetic: true,
  };
}
