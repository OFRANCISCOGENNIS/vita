"use client";

// LEGENDAS no Estúdio — importa um .srt (cada cue vira um clipe de texto na
// trilha "Legendas", editável como qualquer clipe) e exporta os textos da
// timeline de volta para .srt.

import { useState } from "react";
import { Download, Loader2, Sparkles, Upload } from "lucide-react";
import { parseSrt, toSrt } from "@/lib/video-editor/srt";
import { clipEndMs } from "@/lib/video-editor/timeline-math";
import { getMedia } from "@/lib/media-store";
import { transcribeBlob, type AsrCue } from "@/lib/ai/transcribe";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

export function CaptionsPanel() {
  const project = useVideoEditor((s) => s.project);
  const sources = useVideoEditor((s) => s.sources);
  const addCaptionCues = useVideoEditor((s) => s.addCaptionCues);
  const [autoBusy, setAutoBusy] = useState<string | null>(null);

  async function autoCaptions() {
    if (autoBusy) return;
    // clipes de vídeo/áudio da timeline, em ordem — transcreve cada fonte 1x
    const jobs = project.tracks
      .filter((t) => (t.type === "video" || t.type === "audio") && !t.muted)
      .flatMap((t) => t.clips)
      .filter((c) => {
        const src = sources[c.sourceId];
        return src && (src.kind === "video" || src.kind === "audio") && c.volume > 0;
      })
      .sort((a, b) => a.startInTimeline - b.startInTimeline);
    if (jobs.length === 0) {
      toast("Sem áudio na timeline", { description: "Adicione um vídeo ou áudio com fala primeiro.", variant: "error" });
      return;
    }
    setAutoBusy("Preparando a IA…");
    try {
      const cueCache = new Map<string, AsrCue[]>();
      const timelineCues: { startMs: number; endMs: number; text: string }[] = [];
      for (const clip of jobs) {
        const src = sources[clip.sourceId];
        if (!src) continue;
        let cues = cueCache.get(src.id);
        if (!cues) {
          const blob = await getMedia(src.mediaId);
          if (!blob) continue;
          cues = await transcribeBlob(blob, (p) => setAutoBusy(p.message));
          cueCache.set(src.id, cues);
        }
        // mapeia cada cue (tempo da FONTE) para a timeline pela janela do clipe
        for (const cue of cues) {
          const s = Math.max(cue.startMs, clip.trimIn);
          const e = Math.min(cue.endMs, clip.trimOut);
          if (e - s < 200) continue; // fora da janela usada
          timelineCues.push({
            startMs: Math.round(clip.startInTimeline + (s - clip.trimIn) / clip.speed),
            endMs: Math.round(clip.startInTimeline + (e - clip.trimIn) / clip.speed),
            text: cue.text,
          });
        }
      }
      if (timelineCues.length === 0) {
        toast("Nenhuma fala detectada", { description: "O áudio pode não ter voz, ou o modelo não conseguiu baixar.", variant: "error" });
        return;
      }
      const added = addCaptionCues(timelineCues);
      toast(`${added} legendas geradas pela IA`, { description: "Cada uma virou um clipe de texto editável — revise antes de exportar." });
    } catch {
      toast("Falha ao gerar legendas", {
        description: "O modelo (~40 MB) baixa na 1ª vez e precisa de internet estável. Tente de novo.",
        variant: "error",
      });
    } finally {
      setAutoBusy(null);
    }
  }

  async function importSrt(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const cues = parseSrt(await file.text());
      if (cues.length === 0) {
        toast("Nenhuma legenda válida no arquivo", { variant: "error" });
        return;
      }
      const added = addCaptionCues(cues);
      toast(`${added} legendas importadas`, { description: "Cada uma virou um clipe de texto editável." });
    } catch {
      toast("Falha ao ler o arquivo .srt", { variant: "error" });
    }
  }

  function exportSrt() {
    const cues = project.tracks
      .filter((t) => t.type === "text")
      .flatMap((t) => t.clips)
      .filter((c) => c.text?.content)
      .map((c) => ({ startMs: c.startInTimeline, endMs: clipEndMs(c), text: c.text!.content }));
    if (cues.length === 0) {
      toast("Sem textos na timeline para exportar", { variant: "error" });
      return;
    }
    const blob = new Blob([toSrt(cues)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "legendas.srt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(`${cues.length} legendas exportadas (.srt)`);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => void autoCaptions()}
        disabled={!!autoBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2.5 text-xs font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 active:scale-95 disabled:opacity-60 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        {autoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {autoBusy ?? "Legendas automáticas (IA)"}
      </button>
      <p className="text-[10px] leading-relaxed text-zinc-500">
        A IA de fala roda no seu aparelho (baixa ~40 MB na 1ª vez). Revise o texto gerado — ele pode errar palavras.
      </p>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-1/60 px-3 py-2.5 text-xs font-medium text-zinc-300 hover:border-violet-500/50 hover:text-white">
        <Upload className="h-4 w-4" aria-hidden />
        Importar legendas (.srt)
        <input
          type="file"
          accept=".srt,text/plain"
          className="sr-only"
          aria-label="Importar legendas SRT"
          onChange={(e) => {
            void importSrt(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <button
        onClick={exportSrt}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-xs font-medium text-zinc-300 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <Download className="h-4 w-4" aria-hidden />
        Exportar legendas (.srt)
      </button>
      <p className="text-[11px] leading-relaxed text-zinc-600">
        As legendas viram clipes de texto na trilha “Legendas” — dá para mover, aparar e editar o estilo de cada uma.
      </p>
    </div>
  );
}
