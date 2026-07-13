// REMOÇÃO DE FUNDO por IA — 100% no navegador (transformers.js, modelo
// RMBG-1.4 da BRIA). Sem servidor, sem chave: o modelo (~44 MB quantizado) é
// baixado pelo navegador do usuário na 1ª vez e fica em cache. WebGPU quando
// disponível, senão WASM. O transformers.js é importado do CDN em runtime
// (webpackIgnore) para NÃO entrar no bundle do build estático.
//
// Teste E2E: window.__CORTAAI_FAKE_BG__ (se definido) substitui o modelo real,
// permitindo verificar o pipeline sem baixar nada nem depender do huggingface.

const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1";

export interface BgProgress {
  pct: number; // 0..100
  message: string;
}

type FakeBg = (canvas: HTMLCanvasElement) => HTMLCanvasElement | Promise<HTMLCanvasElement>;

declare global {
  interface Window {
    __CORTAAI_FAKE_BG__?: FakeBg;
  }
}

export function isBackgroundRemovalSupported(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

// singletons do modelo/processor (carregados 1x por sessão)
interface Loaded {
  AutoModel: unknown;
  RawImage: unknown;
  model: unknown;
  processor: unknown;
}
let loadedPromise: Promise<Loaded> | null = null;

async function loadModel(onProgress?: (p: BgProgress) => void): Promise<Loaded> {
  if (loadedPromise) return loadedPromise;
  loadedPromise = (async () => {
    onProgress?.({ pct: 5, message: "Carregando o motor de IA…" });
    const tx: any = await import(/* webpackIgnore: true */ `${TRANSFORMERS_CDN}`);
    const { AutoModel, AutoProcessor, RawImage, env } = tx;
    // GitHub Pages não tem COOP/COEP → sem threads; usa o worker interno via blob
    if (env?.backends?.onnx?.wasm) env.backends.onnx.wasm.proxy = true;
    env.allowLocalModels = false;

    const device = (await hasWebGpu()) ? "webgpu" : "wasm";
    let downloaded = 0;
    const progress_callback = (data: any) => {
      if (data?.status === "progress" && typeof data.progress === "number") {
        downloaded = Math.max(downloaded, data.progress);
        onProgress?.({ pct: 5 + Math.round(downloaded * 0.8), message: `Baixando modelo de IA (1ª vez, ~44 MB)… ${Math.round(downloaded)}%` });
      }
    };

    const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
      config: { model_type: "custom" } as any,
      device,
      progress_callback,
    });
    const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: "ImageFeatureExtractor",
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 0.00392156862745098,
        size: { width: 1024, height: 1024 },
      } as any,
    });
    onProgress?.({ pct: 88, message: "Modelo pronto." });
    return { AutoModel, RawImage, model, processor };
  })();
  return loadedPromise;
}

/**
 * Remove o fundo da imagem e devolve um canvas RGBA com o fundo transparente.
 * `onProgress` reporta o download do modelo e a inferência.
 */
export async function removeBackground(
  input: HTMLCanvasElement,
  onProgress?: (p: BgProgress) => void,
): Promise<HTMLCanvasElement> {
  if (!isBackgroundRemovalSupported()) throw new Error("Recurso indisponível neste navegador");

  // atalho de teste
  if (typeof window !== "undefined" && window.__CORTAAI_FAKE_BG__) {
    onProgress?.({ pct: 50, message: "Processando…" });
    const out = await window.__CORTAAI_FAKE_BG__(input);
    onProgress?.({ pct: 100, message: "Concluído." });
    return out;
  }

  const { RawImage, model, processor } = await loadModel(onProgress);
  onProgress?.({ pct: 90, message: "Separando o assunto do fundo…" });

  const dataUrl = input.toDataURL("image/png");
  const image = await (RawImage as any).fromURL(dataUrl);
  const { pixel_values } = await (processor as any)(image);
  const { output } = await (model as any)({ input: pixel_values });

  // máscara alpha (0..1) → redimensiona para o tamanho original
  const mask = await (RawImage as any).fromTensor(output[0].mul(255).to("uint8")).resize(input.width, input.height);
  const maskData: Uint8Array | Uint8ClampedArray = mask.data;

  const out = document.createElement("canvas");
  out.width = input.width;
  out.height = input.height;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas 2D indisponível");
  octx.drawImage(input, 0, 0);
  const img = octx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < maskData.length; i++) {
    d[i * 4 + 3] = maskData[i]; // canal alpha = máscara do assunto
  }
  octx.putImageData(img, 0, 0);
  onProgress?.({ pct: 100, message: "Concluído." });
  return out;
}
