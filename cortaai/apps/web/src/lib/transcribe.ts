// REAL in-browser speech transcription (Whisper via transformers.js).
//
// Runs 100% in the visitor's browser: WebGPU when available, otherwise WASM
// single-thread (GitHub Pages has no COOP/COEP headers, so no SharedArrayBuffer
// threads). The quantized model (~45 MB) is downloaded from the HuggingFace CDN
// on FIRST use and cached by the library (Cache API) for later visits.
//
// The library itself is loaded at RUNTIME from the jsDelivr CDN via a native
// dynamic import (webpackIgnore) — bundling onnxruntime-web through Next's
// webpack breaks on `import.meta`, and a runtime ESM import is the pattern the
// transformers.js docs recommend for browsers. Version pinned in the URL.

import type { TranscriptWord } from "./types";

const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

export interface TranscribeProgress {
  pct: number; // 0-100 within the transcription stage
  message: string; // pt-BR status shown in the generation UI
}

export interface TranscribeResult {
  words: TranscriptWord[];
  /** Seconds of media actually transcribed (may be less than the duration). */
  coverageSeconds: number;
  model: string;
  device: "webgpu" | "wasm";
}

/** Longest stretch we transcribe, by device speed (rest falls back to signal). */
const MAX_SECONDS_WEBGPU = 900;
const MAX_SECONDS_WASM = 480;
/** Same guard as video-analysis: decoding needs the whole file in memory. */
const MAX_AUDIO_BYTES = 300 * 1024 * 1024;
/** Abort if the model makes no progress for this long. */
const WATCHDOG_MS = 180_000;

const TARGET_SAMPLE_RATE = 16_000;

// Models tried in order per device. The *_timestamped exports include the
// cross-attention heads needed for native word-level timestamps.
const MODELS_WEBGPU = ["onnx-community/whisper-base_timestamped", "onnx-community/whisper-tiny_timestamped"];
const MODELS_WASM = ["onnx-community/whisper-tiny_timestamped"];
/** Last-resort model without word timestamps (we interpolate per word). */
const FALLBACK_MODEL = "Xenova/whisper-tiny";

/** E2E test hook: lets Playwright inject a fake transcript (HF is offline in CI). */
declare global {
  interface Window {
    __CORTAAI_FAKE_ASR__?: (durationHint?: number) => TranscriptWord[] | null;
  }
}

export function isTranscribeSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Transcrição cancelada", "AbortError");
}

export class TranscribeTimeoutError extends Error {
  constructor() {
    super("A transcrição demorou demais e foi interrompida");
    this.name = "TranscribeTimeoutError";
  }
}

// ---------------------------------------------------------------- model loading

type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

interface LoadedAsr {
  pipe: AsrPipeline;
  model: string;
  device: "webgpu" | "wasm";
  wordTimestamps: boolean;
  makeStreamer: (onChunkStart: (t: number) => void) => unknown;
}

let asrPromise: Promise<LoadedAsr> | null = null;

async function detectWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

function getTranscriber(onProgress?: (p: TranscribeProgress) => void): Promise<LoadedAsr> {
  if (asrPromise) return asrPromise;
  asrPromise = (async (): Promise<LoadedAsr> => {
    onProgress?.({ pct: 0, message: "Carregando o motor de transcrição…" });
    const tf = await import(/* webpackIgnore: true */ TRANSFORMERS_CDN);
    const { pipeline, env, WhisperTextStreamer } = tf as unknown as {
      pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<AsrPipeline>;
      env: {
        allowLocalModels: boolean;
        backends: { onnx: { wasm: { proxy: boolean; numThreads?: number } } };
      };
      WhisperTextStreamer: new (tokenizer: unknown, opts: Record<string, unknown>) => unknown;
    };
    env.allowLocalModels = false;

    const useWebGpu = await detectWebGpu();
    // Sem COOP/COEP no GitHub Pages não há threads; o proxy do onnxruntime move
    // a inferência WASM para um worker interno (via blob) e a UI não congela.
    if (!useWebGpu) {
      env.backends.onnx.wasm.proxy = true;
      env.backends.onnx.wasm.numThreads = 1;
    }

    // Bytes agregados por arquivo para um % de download estável.
    const fileBytes = new Map<string, { loaded: number; total: number }>();
    const progressCallback = (info: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (info.status !== "progress" || !info.file) return;
      fileBytes.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
      let loaded = 0;
      let total = 0;
      fileBytes.forEach((f) => {
        loaded += f.loaded;
        total += f.total;
      });
      if (total > 0) {
        const pct = Math.round((loaded / total) * 100);
        const mb = Math.max(1, Math.round(total / 1024 / 1024));
        onProgress?.({ pct, message: `Baixando modelo de IA (primeira vez, ~${mb} MB)… ${pct}%` });
      }
    };

    const attempts: Array<{ model: string; device: "webgpu" | "wasm"; wordTimestamps: boolean }> = [];
    if (useWebGpu) {
      for (const m of MODELS_WEBGPU) attempts.push({ model: m, device: "webgpu", wordTimestamps: true });
    }
    for (const m of MODELS_WASM) attempts.push({ model: m, device: "wasm", wordTimestamps: true });
    attempts.push({ model: FALLBACK_MODEL, device: "wasm", wordTimestamps: false });

    let lastErr: unknown = null;
    for (const attempt of attempts) {
      const options: Record<string, unknown> = {
        progress_callback: progressCallback,
        device: attempt.device,
        dtype:
          attempt.device === "webgpu"
            ? { encoder_model: "fp32", decoder_model_merged: "q4" }
            : "q8",
      };
      try {
        const pipe = await pipeline("automatic-speech-recognition", attempt.model, options);
        const tokenizer = (pipe as unknown as { tokenizer?: unknown }).tokenizer;
        return {
          pipe,
          model: attempt.model,
          device: attempt.device,
          wordTimestamps: attempt.wordTimestamps,
          makeStreamer: (onChunkStart) =>
            tokenizer
              ? new WhisperTextStreamer(tokenizer, {
                  skip_prompt: true,
                  on_chunk_start: (t: number) => onChunkStart(t),
                })
              : undefined,
        };
      } catch (err) {
        lastErr = err;
        fileBytes.clear();
        // Se o proxy do WASM falhar neste navegador, tenta na main thread.
        if (attempt.device === "wasm" && env.backends.onnx.wasm.proxy) {
          try {
            env.backends.onnx.wasm.proxy = false;
            const pipe = await pipeline("automatic-speech-recognition", attempt.model, options);
            const tokenizer = (pipe as unknown as { tokenizer?: unknown }).tokenizer;
            return {
              pipe,
              model: attempt.model,
              device: "wasm",
              wordTimestamps: attempt.wordTimestamps,
              makeStreamer: (onChunkStart) =>
                tokenizer
                  ? new WhisperTextStreamer(tokenizer, {
                      skip_prompt: true,
                      on_chunk_start: (t: number) => onChunkStart(t),
                    })
                  : undefined,
            };
          } catch (err2) {
            lastErr = err2;
          }
        }
      }
    }
    throw lastErr ?? new Error("Nenhum modelo de transcrição pôde ser carregado");
  })();
  // Falha no carregamento não pode envenenar as próximas tentativas.
  asrPromise.catch(() => {
    asrPromise = null;
  });
  return asrPromise;
}

// ---------------------------------------------------------------- audio prep

/**
 * Decode (or reuse) the media's audio and resample it to 16 kHz mono, capped at
 * `maxSeconds`. Returns null when there is no decodable audio.
 */
async function getAudioFloat32(
  source: Blob | string,
  maxSeconds: number,
  reuse?: AudioBuffer | null,
  signal?: AbortSignal,
): Promise<{ data: Float32Array; seconds: number } | null> {
  let decoded: AudioBuffer | null = reuse ?? null;

  if (!decoded) {
    let bytes: ArrayBuffer | null = null;
    try {
      if (typeof source !== "string") {
        if (source.size > 0 && source.size <= MAX_AUDIO_BYTES) bytes = await source.arrayBuffer();
      } else {
        const res = await fetch(source, { signal });
        if (res.ok) {
          const len = Number(res.headers.get("content-length") ?? 0);
          if (!len || len <= MAX_AUDIO_BYTES) bytes = await res.arrayBuffer();
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      bytes = null;
    }
    if (!bytes) return null;
    throwIfAborted(signal);

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    try {
      decoded = await ctx.decodeAudioData(bytes);
    } catch {
      return null;
    } finally {
      void ctx.close().catch(() => undefined);
    }
  }

  const seconds = Math.min(decoded.duration, maxSeconds);
  if (seconds < 0.5) return null;
  throwIfAborted(signal);

  try {
    const frames = Math.ceil(seconds * TARGET_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return { data: rendered.getChannelData(0), seconds };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- output mapping

interface AsrChunk {
  text: string;
  timestamp: [number, number | null];
}

/** Map ASR chunks (word- or segment-level) to monotonic TranscriptWords. */
function chunksToWords(chunks: AsrChunk[], wordLevel: boolean, coverage: number): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  let lastEnd = 0;
  const pushWord = (text: string, start: number, end: number) => {
    const word = text.trim();
    if (!word) return;
    let s = Number.isFinite(start) ? Math.max(0, start) : lastEnd;
    let e = Number.isFinite(end) ? end : s + 0.3;
    if (s < lastEnd) s = lastEnd; // monotonic
    if (e <= s) e = s + 0.25;
    if (s > coverage + 2) return; // hallucinated tail beyond audio
    lastEnd = e;
    words.push({ word, start: Math.round(s * 100) / 100, end: Math.round(e * 100) / 100, speaker: "Fala" });
  };

  for (const chunk of chunks) {
    const [a, b] = chunk.timestamp ?? [lastEnd, null];
    if (wordLevel) {
      pushWord(chunk.text, a ?? lastEnd, b ?? (a ?? lastEnd) + 0.3);
    } else {
      // Segment-level: interpolate word times linearly across the segment.
      const parts = chunk.text.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) continue;
      const s = Number.isFinite(a) ? (a as number) : lastEnd;
      const e = Number.isFinite(b as number) && (b as number)! > s ? (b as number)! : s + parts.length * 0.35;
      const step = (e - s) / parts.length;
      parts.forEach((p, i) => pushWord(p, s + i * step, s + (i + 1) * step));
    }
  }
  return words;
}

// ---------------------------------------------------------------- entry point

/**
 * Transcribe the media's speech in the browser. Throws on abort/model failure —
 * callers are expected to fall back to the signal-only pipeline.
 */
export async function transcribeMedia(
  source: Blob | string,
  opts: {
    durationHint?: number;
    language?: string;
    signal?: AbortSignal;
    onProgress?: (p: TranscribeProgress) => void;
    audioBuffer?: AudioBuffer | null;
  } = {},
): Promise<TranscribeResult> {
  if (typeof window === "undefined") throw new Error("Transcrição só roda no navegador");

  // Test hook: deterministic fake transcript without touching the network.
  const fake = window.__CORTAAI_FAKE_ASR__?.(opts.durationHint);
  if (fake && fake.length > 0) {
    opts.onProgress?.({ pct: 100, message: "Transcrição concluída" });
    return {
      words: fake,
      coverageSeconds: fake[fake.length - 1]?.end ?? opts.durationHint ?? 0,
      model: "fake-asr",
      device: "wasm",
    };
  }

  throwIfAborted(opts.signal);
  const asr = await getTranscriber(opts.onProgress);
  throwIfAborted(opts.signal);

  const maxSeconds = asr.device === "webgpu" ? MAX_SECONDS_WEBGPU : MAX_SECONDS_WASM;
  opts.onProgress?.({ pct: 2, message: "Preparando o áudio para a transcrição…" });
  const audio = await getAudioFloat32(source, maxSeconds, opts.audioBuffer, opts.signal);
  if (!audio) throw new Error("Áudio não decodificável para transcrição");
  throwIfAborted(opts.signal);

  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Watchdog: a stalled model (rare WASM edge cases) must not hang the flow.
  let lastTick = Date.now();
  const streamer = asr.makeStreamer((t) => {
    lastTick = Date.now();
    throwIfAborted(opts.signal);
    const pct = Math.min(99, Math.round((t / audio.seconds) * 100));
    opts.onProgress?.({ pct, message: `Transcrevendo a fala… ${fmt(t)} de ${fmt(audio.seconds)}` });
  });
  const watchdog = setInterval(() => {
    if (Date.now() - lastTick > WATCHDOG_MS) {
      clearInterval(watchdog);
    }
  }, 10_000);

  try {
    opts.onProgress?.({ pct: 4, message: `Transcrevendo a fala… 0:00 de ${fmt(audio.seconds)}` });
    const language = opts.language?.toLowerCase().startsWith("pt") ? "portuguese" : undefined;
    const race = await Promise.race([
      asr.pipe(audio.data, {
        ...(language ? { language } : {}),
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: asr.wordTimestamps ? "word" : true,
        ...(streamer ? { streamer } : {}),
      }),
      new Promise((_, reject) => {
        const t = setInterval(() => {
          if (Date.now() - lastTick > WATCHDOG_MS) {
            clearInterval(t);
            reject(new TranscribeTimeoutError());
          }
        }, 10_000);
      }),
    ]);

    const out = race as { text?: string; chunks?: AsrChunk[] };
    const chunks = Array.isArray(out.chunks) ? out.chunks : [];
    const words = chunksToWords(chunks, asr.wordTimestamps, audio.seconds);
    opts.onProgress?.({ pct: 100, message: "Transcrição concluída" });
    return { words, coverageSeconds: audio.seconds, model: asr.model, device: asr.device };
  } finally {
    clearInterval(watchdog);
  }
}
