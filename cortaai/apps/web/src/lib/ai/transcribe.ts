// LEGENDAS AUTOMÁTICAS por IA — Whisper rodando 100% no navegador
// (transformers.js via CDN em runtime; modelo whisper-tiny multilíngue,
// ~40 MB quantizado, baixado 1x e cacheado). Sem servidor, sem chave.
//
// Teste E2E: window.__CORTAAI_FAKE_ASR__ (se definido) devolve as cues sem
// baixar modelo nenhum.

const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1";

export interface AsrProgress {
  pct: number;
  message: string;
}

export interface AsrCue {
  startMs: number; // relativo ao ÁUDIO transcrito
  endMs: number;
  text: string;
}

type FakeAsr = (durationMs: number) => AsrCue[] | Promise<AsrCue[]>;

declare global {
  interface Window {
    __CORTAAI_FAKE_ASR__?: FakeAsr;
  }
}

let asrPromise: Promise<unknown> | null = null;

async function loadAsr(onProgress?: (p: AsrProgress) => void): Promise<unknown> {
  if (asrPromise) return asrPromise;
  asrPromise = (async () => {
    onProgress?.({ pct: 5, message: "Carregando o motor de IA…" });
    // eslint-disable-next-line
    const tx: any = await import(/* webpackIgnore: true */ `${TRANSFORMERS_CDN}`);
    const { pipeline, env } = tx;
    if (env?.backends?.onnx?.wasm) env.backends.onnx.wasm.proxy = true;
    env.allowLocalModels = false;
    let downloaded = 0;
    // eslint-disable-next-line
    const progress_callback = (data: any) => {
      if (data?.status === "progress" && typeof data.progress === "number") {
        downloaded = Math.max(downloaded, data.progress);
        onProgress?.({ pct: 5 + Math.round(downloaded * 0.75), message: `Baixando modelo de fala (1ª vez, ~40 MB)… ${Math.round(downloaded)}%` });
      }
    };
    return pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", { progress_callback });
  })();
  return asrPromise;
}

/** Decodifica um Blob de mídia para Float32 mono 16 kHz (formato do Whisper). */
export async function decodeTo16k(blob: Blob): Promise<{ data: Float32Array; durationMs: number } | null> {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      void ctx.close().catch(() => undefined);
    }
    const durationMs = Math.round(decoded.duration * 1000);
    const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
    const off = new OfflineAudioContext(1, frames, 16000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start(0);
    const rendered = await off.startRendering();
    return { data: rendered.getChannelData(0), durationMs };
  } catch {
    return null;
  }
}

/**
 * Transcreve o áudio de um Blob de mídia e devolve cues com timestamps
 * (relativos ao próprio áudio). `language` "portuguese" por padrão.
 */
export async function transcribeBlob(
  blob: Blob,
  onProgress?: (p: AsrProgress) => void,
  language = "portuguese",
): Promise<AsrCue[]> {
  const audio = await decodeTo16k(blob);
  if (!audio) throw new Error("Não foi possível decodificar o áudio desta mídia");

  // atalho de teste
  if (typeof window !== "undefined" && window.__CORTAAI_FAKE_ASR__) {
    onProgress?.({ pct: 60, message: "Transcrevendo…" });
    const cues = await window.__CORTAAI_FAKE_ASR__(audio.durationMs);
    onProgress?.({ pct: 100, message: "Concluído." });
    return cues;
  }

  // eslint-disable-next-line
  const pipe: any = await loadAsr(onProgress);
  onProgress?.({ pct: 85, message: "Transcrevendo a fala…" });
  const result = await pipe(audio.data, {
    language,
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });

  const cues: AsrCue[] = [];
  const chunks: { timestamp: [number, number | null]; text: string }[] = result?.chunks ?? [];
  for (const ch of chunks) {
    const text = (ch.text ?? "").trim();
    if (!text) continue;
    const start = Math.max(0, Math.round((ch.timestamp?.[0] ?? 0) * 1000));
    const rawEnd = ch.timestamp?.[1];
    const end = rawEnd != null ? Math.round(rawEnd * 1000) : Math.min(audio.durationMs, start + 3000);
    if (end <= start) continue;
    cues.push({ startMs: start, endMs: end, text });
  }
  onProgress?.({ pct: 100, message: "Concluído." });
  return cues;
}
