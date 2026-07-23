// NARRAÇÃO POR IA (Text-to-Speech) — Kokoro-82M rodando 100% no navegador
// (kokoro-js via CDN em runtime; modelo ~80 MB quantizado, baixado 1x e
// cacheado). Vozes em PORTUGUÊS incluídas no modelo. Sem servidor, sem chave.
//
// Teste E2E: window.__CORTAAI_FAKE_TTS__ devolve amostras sintéticas sem
// baixar modelo nenhum.

const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";

export interface TtsProgress {
  pct: number;
  message: string;
}

export interface TtsResult {
  blob: Blob; // WAV 16-bit
  durationMs: number;
}

export const TTS_VOICES: { id: string; name: string }[] = [
  { id: "pf_dora", name: "Dora (feminina, PT)" },
  { id: "pm_alex", name: "Alex (masculina, PT)" },
  { id: "pm_santa", name: "Santa (masculina, PT)" },
];

type FakeTts = (text: string) => { sampleRate: number; samples: Float32Array } | Promise<{ sampleRate: number; samples: Float32Array }>;

declare global {
  interface Window {
    __CORTAAI_FAKE_TTS__?: FakeTts;
  }
}

let ttsPromise: Promise<unknown> | null = null;

async function loadTts(onProgress?: (p: TtsProgress) => void): Promise<unknown> {
  if (ttsPromise) return ttsPromise;
  ttsPromise = (async () => {
    onProgress?.({ pct: 5, message: "Carregando o motor de voz…" });
    // eslint-disable-next-line
    const mod: any = await import(/* webpackIgnore: true */ `${KOKORO_CDN}`);
    let downloaded = 0;
    // eslint-disable-next-line
    const progress_callback = (data: any) => {
      if (data?.status === "progress" && typeof data.progress === "number") {
        downloaded = Math.max(downloaded, data.progress);
        onProgress?.({ pct: 5 + Math.round(downloaded * 0.85), message: `Baixando voz de IA (1ª vez, ~80 MB)… ${Math.round(downloaded)}%` });
      }
    };
    return mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "wasm",
      progress_callback,
    });
  })();
  return ttsPromise;
}

/** Codifica Float32 mono em WAV PCM 16-bit. */
function floatToWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * 2;
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
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

/**
 * Gera narração falada a partir do texto. Devolve WAV pronto para virar clipe
 * de áudio na timeline.
 */
export async function generateSpeech(
  text: string,
  voiceId: string,
  onProgress?: (p: TtsProgress) => void,
): Promise<TtsResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Digite o texto da narração");

  // atalho de teste
  if (typeof window !== "undefined" && window.__CORTAAI_FAKE_TTS__) {
    onProgress?.({ pct: 60, message: "Gerando narração…" });
    const fake = await window.__CORTAAI_FAKE_TTS__(clean);
    onProgress?.({ pct: 100, message: "Concluído." });
    return {
      blob: floatToWav(fake.samples, fake.sampleRate),
      durationMs: Math.round((fake.samples.length / fake.sampleRate) * 1000),
    };
  }

  // eslint-disable-next-line
  const tts: any = await loadTts(onProgress);
  onProgress?.({ pct: 92, message: "Gerando narração…" });
  const audio = await tts.generate(clean, { voice: voiceId });
  const samples: Float32Array = audio.audio;
  const sampleRate: number = audio.sampling_rate;
  onProgress?.({ pct: 100, message: "Concluído." });
  return {
    blob: floatToWav(samples, sampleRate),
    durationMs: Math.round((samples.length / sampleRate) * 1000),
  };
}
