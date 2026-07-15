// PONTE entre os vídeos do app (projetos/cortes, blobs no IndexedDB) e o
// Estúdio PRO multitrilha: cria um projeto do Estúdio apontando para o MESMO
// blob (sem duplicar) — com recorte opcional (início/fim) para abrir um corte.

import { saveMedia } from "@/lib/media-store";
import { makeClip, makeProject, newId } from "@/lib/video-editor/model";
import { sourceFromExistingMedia } from "@/lib/video-editor/media-registry";
import { saveProjectEntry, setCurrentProjectId } from "@/lib/video-editor/project-library";

export interface OpenInStudioInput {
  /** Blob salvo no IndexedDB (projetos enviados por arquivo). */
  mediaId?: string;
  /** URL direta de vídeo (projetos importados por link). */
  mediaUrl?: string;
  name: string;
  /** Recorte opcional (segundos) — usado ao abrir um CORTE no Estúdio. */
  startSec?: number;
  endSec?: number;
}

export type OpenInStudioResult = { ok: true } | { ok: false; reason: string };

const NO_MEDIA_MSG =
  "O vídeo deste projeto não está salvo neste navegador — envie o arquivo de novo em Novo vídeo para abrir no Estúdio.";

/** Prepara o projeto no Estúdio e retorna ok; o chamador navega para /app/estudio. */
export async function openInStudio(input: OpenInStudioInput): Promise<OpenInStudioResult> {
  let mediaId = input.mediaId ?? null;

  // projeto importado por URL: baixa e salva localmente (uma vez)
  if (!mediaId && input.mediaUrl) {
    try {
      const resp = await fetch(input.mediaUrl);
      if (!resp.ok) throw new Error(String(resp.status));
      const blob = await resp.blob();
      mediaId = newId("media");
      await saveMedia(mediaId, blob);
    } catch {
      return { ok: false, reason: "Não foi possível baixar o vídeo dessa URL (o site de origem bloqueou o acesso)." };
    }
  }
  if (!mediaId) return { ok: false, reason: NO_MEDIA_MSG };

  const source = await sourceFromExistingMedia(mediaId, input.name || "Vídeo", "video");
  if (!source || source.durationMs <= 0) return { ok: false, reason: NO_MEDIA_MSG };

  // resolução do projeto = a do próprio vídeo (fallback vertical padrão)
  const w = source.width > 15 ? source.width : 1080;
  const h = source.height > 15 ? source.height : 1920;
  const project = makeProject(input.name || "Meu vídeo", { w, h }, 30);
  const videoTrack = project.tracks.find((t) => t.type === "video");
  if (!videoTrack) return { ok: false, reason: NO_MEDIA_MSG };

  const startMs = Math.max(0, Math.round((input.startSec ?? 0) * 1000));
  const endMs =
    input.endSec != null ? Math.max(startMs + 100, Math.min(source.durationMs, Math.round(input.endSec * 1000))) : source.durationMs;
  const durMs = Math.max(100, endMs - startMs);
  const clip = makeClip({
    trackId: videoTrack.id,
    sourceId: source.id,
    startInTimeline: 0,
    duration: durMs,
    trimIn: startMs,
    trimOut: endMs,
  });
  videoTrack.clips.push(clip);

  saveProjectEntry(project, [source], durMs);
  setCurrentProjectId(project.id);
  return { ok: true };
}
