"use client";

// LEGENDAS no Estúdio — importa um .srt (cada cue vira um clipe de texto na
// trilha "Legendas", editável como qualquer clipe) e exporta os textos da
// timeline de volta para .srt.

import { Download, Upload } from "lucide-react";
import { parseSrt, toSrt } from "@/lib/video-editor/srt";
import { clipEndMs } from "@/lib/video-editor/timeline-math";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

export function CaptionsPanel() {
  const project = useVideoEditor((s) => s.project);
  const addCaptionCues = useVideoEditor((s) => s.addCaptionCues);

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
