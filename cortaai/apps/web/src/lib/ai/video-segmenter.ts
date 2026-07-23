// REMOÇÃO DE FUNDO DE VÍDEO POR IA — MediaPipe Selfie Segmenter rodando 100%
// no navegador (tasks-vision via CDN em runtime; modelo ~3 MB, baixado 1x e
// cacheado). Segmenta a PESSOA quadro a quadro e registra um provider de
// máscara no motor de desenho (preview e exportação usam o mesmo caminho).
//
// Teste E2E: window.__CORTAAI_FAKE_BGSEG__ = "left" registra uma máscara
// procedural (mantém a metade esquerda) sem baixar modelo nenhum.

import { setBgMaskProvider } from "@/lib/video-editor/engine";

const TASKS_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

declare global {
  interface Window {
    __CORTAAI_FAKE_BGSEG__?: "left" | "right";
  }
}

// eslint-disable-next-line
let segmenter: any = null;
let loadPromise: Promise<boolean> | null = null;
let lastTs = 0;
let lastFailAt = 0;

let workCanvas: HTMLCanvasElement | null = null;
let maskCanvas: HTMLCanvasElement | null = null;

export function isBgVideoReady(): boolean {
  if (typeof window !== "undefined" && window.__CORTAAI_FAKE_BGSEG__) return true;
  return segmenter != null;
}

function fakeMask(mode: "left" | "right", w: number, h: number): HTMLCanvasElement {
  if (!maskCanvas) maskCanvas = document.createElement("canvas");
  maskCanvas.width = Math.max(2, w);
  maskCanvas.height = Math.max(2, h);
  const c = maskCanvas.getContext("2d")!;
  c.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  c.fillStyle = "#fff";
  if (mode === "left") c.fillRect(0, 0, Math.floor(maskCanvas.width / 2), maskCanvas.height);
  else c.fillRect(Math.floor(maskCanvas.width / 2), 0, Math.ceil(maskCanvas.width / 2), maskCanvas.height);
  return maskCanvas;
}

/** Falhas de segmentação POR FRAME (runtime) — a exportação confere no final. */
let frameFailures = 0;
export function resetBgSegFrameFailures(): void {
  frameFailures = 0;
}
export function getBgSegFrameFailures(): number {
  return frameFailures;
}

function registerProvider(): void {
  setBgMaskProvider((el, srcW, srcH) => {
    const fake = typeof window !== "undefined" ? window.__CORTAAI_FAKE_BGSEG__ : undefined;
    if (fake) return fakeMask(fake, 64, 64);
    if (!segmenter || typeof document === "undefined") return null;
    // eslint-disable-next-line
    let result: any = null;
    try {
      // frame reduzido para a IA (velocidade); a máscara volta esticada no draw
      const W = 256;
      const H = Math.max(16, Math.round((srcH / Math.max(1, srcW)) * 256));
      if (!workCanvas) workCanvas = document.createElement("canvas");
      if (workCanvas.width !== W || workCanvas.height !== H) {
        workCanvas.width = W;
        workCanvas.height = H;
      }
      const wctx = workCanvas.getContext("2d", { willReadFrequently: true });
      if (!wctx) {
        frameFailures++;
        return null;
      }
      wctx.drawImage(el, 0, 0, W, H);
      lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
      result = segmenter.segmentForVideo(workCanvas, lastTs);
      const masks = result?.confidenceMasks;
      if (!masks || masks.length === 0) {
        frameFailures++;
        return null;
      }
      // escolhe a máscara da PESSOA pelos rótulos (defensivo entre versões)
      // eslint-disable-next-line
      const labels: string[] = (segmenter.getLabels?.() ?? []).map((l: any) => String(l));
      let idx = labels.findIndex((l) => /person|selfie|foreground/i.test(l));
      if (idx < 0 || idx >= masks.length) idx = masks.length > 1 ? 1 : 0;
      const invert = /background/i.test(labels[idx] ?? "");
      const mask = masks[idx];
      const data: Float32Array = mask.getAsFloat32Array();
      const mw: number = mask.width ?? W;
      const mh: number = mask.height ?? H;
      if (!maskCanvas) maskCanvas = document.createElement("canvas");
      maskCanvas.width = mw;
      maskCanvas.height = mh;
      const mctx = maskCanvas.getContext("2d");
      if (!mctx) {
        frameFailures++;
        return null;
      }
      const img = mctx.createImageData(mw, mh);
      for (let i = 0; i < data.length; i++) {
        const v = Math.max(0, Math.min(1, data[i]));
        const a = Math.round((invert ? 1 - v : v) * 255);
        const o = i * 4;
        img.data[o] = 255;
        img.data[o + 1] = 255;
        img.data[o + 2] = 255;
        img.data[o + 3] = a;
      }
      mctx.putImageData(img, 0, 0);
      return maskCanvas;
    } catch {
      frameFailures++;
      return null;
    } finally {
      // MPMask é dono de recursos WASM/GPU — sempre liberar, mesmo com exceção
      try {
        result?.close?.();
      } catch {
        /* já fechado */
      }
    }
  });
}

/**
 * Garante o segmentador carregado e o provider registrado no motor.
 * True = pronto; false = falhou (sem internet / navegador sem suporte).
 */
export async function ensureBgVideoSegmenter(onProgress?: (message: string) => void): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.__CORTAAI_FAKE_BGSEG__) {
    registerProvider();
    return true;
  }
  if (segmenter) return true;
  // cooldown pós-falha: evita re-baixar o modelo a cada edição enquanto offline
  if (!loadPromise && Date.now() - lastFailAt < 15_000) return false;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        onProgress?.("Carregando a IA de recorte (1ª vez, ~3 MB)…");
        // eslint-disable-next-line
        const vision: any = await import(/* webpackIgnore: true */ `${TASKS_CDN}`);
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
        const options = (delegate: "GPU" | "CPU") => ({
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
        });
        try {
          segmenter = await vision.ImageSegmenter.createFromOptions(fileset, options("GPU"));
        } catch {
          segmenter = await vision.ImageSegmenter.createFromOptions(fileset, options("CPU"));
        }
        registerProvider();
        try {
          window.dispatchEvent(new Event("cortaai-bgseg-ready"));
        } catch {
          /* ambiente sem eventos */
        }
        return true;
      } catch {
        loadPromise = null;
        lastFailAt = Date.now();
        return false;
      }
    })();
  }
  return loadPromise;
}
