"use client";

// Exportação do PROJETO multitrilha — renderização REAL no navegador
// (WebCodecs): todas as trilhas visíveis + áudio mixado (som dos vídeos e
// música). O arquivo baixa na hora. Sem WebCodecs, aviso honesto.

import { useRef, useState } from "react";
import { Download, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isExportSupported, renderProjectToBlob, type ExportFormat } from "@/lib/video-editor/export-project";
import { projectDurationMs } from "@/lib/video-editor/timeline-math";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";

const RESOLUTIONS = [
  { id: "720p", label: "HD", shortSide: 720, hint: "mais rápido" },
  { id: "1080p", label: "Full HD", shortSide: 1080, hint: "recomendado" },
  { id: "1440p", label: "2K", shortSide: 1440, hint: "nítido" },
  { id: "2160p", label: "4K", shortSide: 2160, hint: "pesado" },
  { id: "4320p", label: "8K", shortSide: 4320, hint: "experimental" },
] as const;

const FPS_OPTIONS = [24, 30, 60] as const;

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "video", label: "Vídeo", hint: "MP4/WebM com áudio" },
  { id: "gif", label: "GIF", hint: "animado, sem som" },
  { id: "png-seq", label: "PNG (.zip)", hint: "sequência de quadros" },
];

export function ExportProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useVideoEditor((s) => s.project);
  const sources = useVideoEditor((s) => s.sources);

  const [format, setFormat] = useState<ExportFormat>("video");
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]["id"]>("1080p");
  const [fps, setFps] = useState<(typeof FPS_OPTIONS)[number]>(30);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const supported = isExportSupported();
  const durationMs = projectDurationMs(project.tracks);
  const heavyRes = resolution === "1440p" || resolution === "2160p" || resolution === "4320p";

  async function startExport() {
    setExporting(true);
    setProgress({ pct: 0, message: "Preparando…" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const shortSide = RESOLUTIONS.find((r) => r.id === resolution)?.shortSide ?? 1080;
      const result = await renderProjectToBlob(project, sources, {
        shortSide,
        fps,
        format,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast(format === "video" ? "Vídeo exportado" : format === "gif" ? "GIF exportado" : "Sequência PNG exportada", {
        description: format === "video" ? `${result.fileName} — com áudio mixado` : result.fileName,
      });
      onClose();
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        toast("Exportação cancelada");
      } else {
        toast("Falha ao exportar", { description: err instanceof Error ? err.message : "Erro inesperado", variant: "error" });
      }
    } finally {
      setExporting(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  return (
    <Modal open={open} onClose={exporting ? () => undefined : onClose} title="Exportar vídeo">
      <div className="space-y-4">
        {!supported && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Este navegador não suporta renderização local (WebCodecs). Use Chrome/Edge no computador ou Android.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Formato</p>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                disabled={exporting}
                aria-pressed={format === f.id}
                className={cn(
                  "rounded-xl border px-2 py-2 text-left text-xs transition-colors",
                  format === f.id ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
                )}
              >
                <span className="block font-semibold">{f.label}</span>
                <span className="text-[10px] text-zinc-500">{f.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Resolução</p>
          <div className="grid grid-cols-3 gap-2">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setResolution(r.id)}
                disabled={exporting}
                aria-pressed={resolution === r.id}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  resolution === r.id ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
                )}
              >
                <span className="block font-semibold">{r.label}</span>
                <span className="text-[10px] text-zinc-500">{r.hint}</span>
              </button>
            ))}
          </div>
          {heavyRes && (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {resolution === "4320p"
                ? "8K é experimental: exige um computador forte e bastante memória — pode demorar muito ou falhar em celulares. Se falhar, use 4K."
                : "Resolução alta deixa a exportação mais lenta e o arquivo maior. Acima de 1080p pode sair em WebM (VP9) quando o navegador não codifica H.264 nesse tamanho."}
            </p>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Quadros por segundo</p>
          <div className="grid grid-cols-3 gap-2">
            {FPS_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => setFps(f)}
                disabled={exporting}
                aria-pressed={fps === f}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                  fps === f ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-zinc-500">
          Duração do projeto: {(durationMs / 1000).toFixed(1)}s ·{" "}
          {format === "video"
            ? "MP4 (H.264) quando o navegador suportar, senão WebM. Áudio dos vídeos e músicas mixados no arquivo."
            : format === "gif"
              ? "GIF animado (sem som), reduzido para ~480px e ~15 fps para o arquivo não ficar gigante."
              : "Um .zip com um PNG por quadro (sem som) — ideal para reeditar em outro programa."}
        </p>

        {progress && (
          <div>
            <Progress value={progress.pct} />
            <p className="mt-1.5 text-xs text-zinc-400">{progress.message}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {exporting ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              <XCircle className="mr-1.5 h-4 w-4" aria-hidden /> Cancelar
            </Button>
          ) : (
            <Button onClick={startExport} disabled={!supported || durationMs < 200}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden /> Exportar agora
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
