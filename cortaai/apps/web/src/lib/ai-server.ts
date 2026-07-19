// Cliente do servidor de IA pesada (self-host) — hoje: Wan2.2 (gerar vídeo).
//
// O CortaAí é 100% estático; geração de vídeo por IA exige GPU e roda num
// servidor que o PRÓPRIO usuário hospeda (cortaai/server/wan22). Aqui fica o
// cliente honesto: guarda a URL configurada, checa /api/health de verdade e
// conversa com a API assíncrona de jobs. Também aceita o servidor Node antigo
// (cortaai/server via Replicate), que responde { url } síncrono.

export const AI_SERVER_KEY = "cortaai-ai-server-url";

export function getAiServerUrl(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(AI_SERVER_KEY) ?? "").trim();
}

export function setAiServerUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, "");
  if (clean) localStorage.setItem(AI_SERVER_KEY, clean);
  else localStorage.removeItem(AI_SERVER_KEY);
}

export interface AiHealth {
  ok: boolean;
  aiEnabled: boolean;
  service?: string;
  model?: string;
  features?: string[];
  detail?: string | null;
}

/** GET /api/health com timeout curto — nunca deixa a UI pendurada. */
export async function checkAiServer(url: string, timeoutMs = 6000): Promise<AiHealth> {
  const base = url.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, aiEnabled: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/api/health`, { signal: ctrl.signal });
    if (!resp.ok) return { ok: false, aiEnabled: false };
    const data = (await resp.json()) as AiHealth;
    return { ok: data.ok === true, aiEnabled: data.aiEnabled === true, service: data.service, model: data.model, features: data.features, detail: data.detail };
  } catch {
    return { ok: false, aiEnabled: false };
  } finally {
    clearTimeout(timer);
  }
}

export interface GenerateVideoInput {
  serverUrl: string;
  prompt: string;
  /** data URL para imagem → vídeo (opcional). */
  imageDataUrl?: string;
  /** formato WIDTH*HEIGHT do Wan2.2 (ex.: 1280*704). */
  size?: string;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}

async function readError(resp: Response): Promise<string> {
  try {
    const data = await resp.json();
    return String(data.detail ?? data.error ?? resp.status);
  } catch {
    return `HTTP ${resp.status}`;
  }
}

/**
 * Gera um vídeo no servidor configurado e retorna o Blob MP4.
 * Wan2.2 (assíncrono): { jobId } → polling → download.
 * Servidor Node/Replicate (síncrono): { url } → download.
 */
export async function generateAiVideo(input: GenerateVideoInput): Promise<Blob> {
  const base = input.serverUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Configure a URL do servidor de IA primeiro.");
  input.onStatus?.("Enviando o pedido ao servidor…");
  const resp = await fetch(`${base}/api/generate-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: input.prompt, imageDataUrl: input.imageDataUrl, size: input.size }),
    signal: input.signal,
  });
  if (!resp.ok) throw new Error(await readError(resp));
  const data = (await resp.json()) as { jobId?: string; url?: string };

  let videoUrl: string;
  if (data.jobId) {
    // API assíncrona (Wan2.2): polling até done/error.
    const started = Date.now();
    for (;;) {
      if (input.signal?.aborted) throw new Error("Geração cancelada.");
      await new Promise((r) => setTimeout(r, 3000));
      const st = await fetch(`${base}/api/jobs/${data.jobId}`, { signal: input.signal });
      if (!st.ok) throw new Error(await readError(st));
      const job = (await st.json()) as { status: string; error?: string | null };
      if (job.status === "done") break;
      if (job.status === "error") throw new Error(job.error || "O servidor falhou ao gerar o vídeo.");
      const mins = Math.floor((Date.now() - started) / 60000);
      input.onStatus?.(
        job.status === "running"
          ? `Gerando na GPU… ${mins > 0 ? `${mins} min` : "isso leva alguns minutos"}`
          : "Na fila do servidor…",
      );
    }
    videoUrl = `${base}/api/jobs/${data.jobId}/video`;
  } else if (data.url) {
    videoUrl = data.url;
  } else {
    throw new Error("Resposta inesperada do servidor (sem jobId nem url).");
  }

  input.onStatus?.("Baixando o vídeo gerado…");
  const dl = await fetch(videoUrl, { signal: input.signal });
  if (!dl.ok) throw new Error(await readError(dl));
  const blob = await dl.blob();
  if (blob.size === 0) throw new Error("O servidor devolveu um arquivo vazio.");
  return blob;
}
