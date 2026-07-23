// Registro de mídias do projeto: importa um File, guarda o blob no IndexedDB
// (reutiliza media-store) e sonda metadados (duração, dimensões, poster). Os
// blobs vivem no IndexedDB; aqui ficam só os metadados serializáveis + um cache
// de object URLs para reprodução.

import { getMediaObjectUrl, saveMedia } from "@/lib/media-store";
import { newId } from "./model";

export type SourceKind = "video" | "image" | "audio";

export interface MediaSource {
  id: string;
  kind: SourceKind;
  name: string;
  mediaId: string; // chave do blob no IndexedDB
  durationMs: number; // imagens: duração padrão de exibição
  width: number;
  height: number;
  posterDataUrl: string | null;
}

/** Duração padrão de uma imagem parada ao entrar na timeline. */
export const IMAGE_DEFAULT_MS = 5000;

export function fileKind(file: File): SourceKind | null {
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v)$/i.test(file.name)) return "video";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) return "image";
  if (file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name)) return "audio";
  return null;
}

/** Importa um arquivo e devolve o MediaSource pronto (ou null se sem suporte). */
export async function registerFile(file: File): Promise<MediaSource | null> {
  const kind = fileKind(file);
  if (!kind) return null;
  const mediaId = newId("media");
  const persisted = await saveMedia(mediaId, file);
  void persisted; // mesmo sem persistir, o cache de sessão mantém a mídia editável

  const url = URL.createObjectURL(file);
  try {
    if (kind === "video") return await probeVideo(file.name, mediaId, url);
    if (kind === "image") return await probeImage(file.name, mediaId, url);
    return await probeAudio(file.name, mediaId, url);
  } finally {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Cria um MediaSource a partir de um blob JÁ SALVO no IndexedDB (ex.: vídeo de
 * um projeto/corte do app) — sem duplicar o arquivo. Null se o blob não existe.
 */
export async function sourceFromExistingMedia(mediaId: string, name: string, kind: SourceKind): Promise<MediaSource | null> {
  const url = await getMediaObjectUrl(mediaId);
  if (!url) return null;
  if (kind === "video") return probeVideo(name, mediaId, url);
  if (kind === "image") return probeImage(name, mediaId, url);
  return probeAudio(name, mediaId, url);
}

function probeVideo(name: string, mediaId: string, url: string): Promise<MediaSource> {
  return new Promise((resolve) => {
    const base: MediaSource = { id: newId("src"), kind: "video", name, mediaId, durationMs: 0, width: 0, height: 0, posterDataUrl: null };
    if (typeof document === "undefined") {
      resolve(base);
      return;
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.setAttribute("playsinline", "");
    const timer = setTimeout(() => finish(), 12_000);
    function capturePoster(): string | null {
      try {
        if (!v.videoWidth || !v.videoHeight) return null;
        const c = document.createElement("canvas");
        const scale = Math.min(1, 320 / v.videoWidth);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", 0.7);
      } catch {
        return null;
      }
    }
    function finish() {
      clearTimeout(timer);
      base.durationMs = Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0;
      base.width = v.videoWidth || 0;
      base.height = v.videoHeight || 0;
      base.posterDataUrl = capturePoster();
      v.removeAttribute("src");
      try {
        v.load();
      } catch {
        /* ignore */
      }
      resolve(base);
    }
    v.onloadedmetadata = () => {
      const seekTo = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(v.duration * 0.25, 1.5) : 0;
      v.onseeked = finish;
      try {
        v.currentTime = seekTo;
        setTimeout(() => finish(), 1200);
      } catch {
        finish();
      }
    };
    v.onerror = finish;
    v.src = url;
  });
}

function probeImage(name: string, mediaId: string, url: string): Promise<MediaSource> {
  return new Promise((resolve) => {
    const base: MediaSource = { id: newId("src"), kind: "image", name, mediaId, durationMs: IMAGE_DEFAULT_MS, width: 0, height: 0, posterDataUrl: null };
    if (typeof document === "undefined") {
      resolve(base);
      return;
    }
    const img = new Image();
    const timer = setTimeout(() => resolve(base), 8000);
    img.onload = () => {
      clearTimeout(timer);
      base.width = img.naturalWidth;
      base.height = img.naturalHeight;
      base.posterDataUrl = url.startsWith("blob:") ? null : url; // poster real via objectURL no player
      resolve(base);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(base);
    };
    img.src = url;
  });
}

function probeAudio(name: string, mediaId: string, url: string): Promise<MediaSource> {
  return new Promise((resolve) => {
    const base: MediaSource = { id: newId("src"), kind: "audio", name, mediaId, durationMs: 0, width: 0, height: 0, posterDataUrl: null };
    if (typeof document === "undefined") {
      resolve(base);
      return;
    }
    const a = document.createElement("audio");
    a.preload = "metadata";
    const timer = setTimeout(() => resolve(base), 8000);
    a.onloadedmetadata = () => {
      clearTimeout(timer);
      base.durationMs = Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0;
      resolve(base);
    };
    a.onerror = () => {
      clearTimeout(timer);
      resolve(base);
    };
    a.src = url;
  });
}

/** Registra um Blob já em memória (ex.: trilha gerada) como MediaSource. */
export async function registerBlob(
  blob: Blob,
  name: string,
  kind: SourceKind,
  durationMs: number,
  dims: { width: number; height: number } = { width: 0, height: 0 },
): Promise<MediaSource> {
  const mediaId = newId("media");
  await saveMedia(mediaId, blob);
  return { id: newId("src"), kind, name, mediaId, durationMs, width: dims.width, height: dims.height, posterDataUrl: null };
}

// ------------------------------------------------------- object URL cache

const urlCache = new Map<string, string>();

/** Object URL reproduzível para a mídia de uma fonte (cache por mediaId). */
export async function sourceObjectUrl(source: MediaSource): Promise<string | null> {
  const cached = urlCache.get(source.mediaId);
  if (cached) return cached;
  const url = await getMediaObjectUrl(source.mediaId);
  if (url) urlCache.set(source.mediaId, url);
  return url;
}

export function revokeSourceUrls(): void {
  urlCache.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  });
  urlCache.clear();
}
