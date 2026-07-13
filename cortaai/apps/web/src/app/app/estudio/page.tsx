"use client";

// Editor de vídeo multitrilha (em construção — Fatia A: timeline read-only).
// Rota nova e aditiva; o editor atual (/app/editor) segue intacto.

import { useEffect, useRef } from "react";
import { Info } from "lucide-react";
import { makeClip, makeProject, makeTrack, type Project } from "@/lib/video-editor/model";
import { useVideoEditor } from "@/store/video-editor";
import { TimelineTracks } from "@/components/video-editor/TimelineTracks";

/** Projeto de exemplo determinístico para validar a timeline. */
function mockProject(): Project {
  const p = makeProject("Demonstração — timeline", { w: 1080, h: 1920 }, 30);
  const video = { ...makeTrack("video", "Vídeo", "trk_video"), clips: [
    makeClip({ trackId: "trk_video", sourceId: "cena-1.mp4", startInTimeline: 0, duration: 4000, id: "c1" }),
    makeClip({ trackId: "trk_video", sourceId: "cena-2.mp4", startInTimeline: 4000, duration: 3000, id: "c2" }),
    makeClip({ trackId: "trk_video", sourceId: "cena-3.mp4", startInTimeline: 7000, duration: 5000, speed: 2, trimIn: 0, trimOut: 10000, id: "c3" }),
  ] };
  const audio = { ...makeTrack("audio", "Música", "trk_audio"), clips: [
    makeClip({ trackId: "trk_audio", sourceId: "trilha.mp3", startInTimeline: 0, duration: 12000, id: "a1" }),
  ] };
  const text = { ...makeTrack("text", "Texto", "trk_text"), clips: [
    { ...makeClip({ trackId: "trk_text", sourceId: "titulo", startInTimeline: 500, duration: 3000, id: "t1" }), text: { content: "Meu título", fontFamily: "Inter", color: "#fff", fontWeight: 800, background: null } },
  ] };
  return { ...p, tracks: [video, text, audio] };
}

export default function EstudioPage() {
  const loadProject = useVideoEditor((s) => s.loadProject);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    loadProject(mockProject());
  }, [loadProject]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Estúdio de vídeo</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Novo editor multitrilha — em construção. Esta é a timeline com dados de exemplo (Fatia A).
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Prévia técnica: por enquanto a timeline apenas exibe o modelo (clique para mover o playhead, selecione
        clipes, ajuste o zoom, oculte trilhas). Importar mídia, arrastar, cortar e compor no preview entram nas
        próximas etapas.
      </p>

      <TimelineTracks />
    </div>
  );
}
