"use client";

// Exportação do PROJETO multitrilha — renderização REAL no navegador
// (WebCodecs): todas as trilhas visíveis + áudio mixado (som dos vídeos e
// música). O arquivo baixa na hora. Sem WebCodecs, aviso honesto.

import { useEffect, useRef, useState } from "react";
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

/** Resolução padrão persistida (o seletor do topo do Estúdio escreve aqui). */
export const EXPORT_RES_KEY = "cortaai-export-res";

function readDefaultRes(): (typeof RESOLUTIONS)[number]["id"] {
  try {
    const v = localStorage.getItem(EXPORT_RES_KEY);
    if (v && RESOLUTIONS.some((r) => r.id === v)) return v as (typeof RESOLUTIONS)[number]["id"];
  } catch {
    /* sem storage */
  }
  return "1080p";
}

const FPS_OPTIONS = [24, 30, 60] as const;

/** Opções de extensão — cada uma mapeia para um formato/contêiner REAL. */
const FORMATS: { id: string; label: string; hint: string; format: ExportFormat; container?: "mp4" | "webm" }[] = [
  { id: "mp4", label: "MP4", hint: "vídeo H.264 + AAC", format: "video", container: "mp4" },
  { id: "webm", label: "WebM", hint: "vídeo VP9, sempre disponível", format: "video", container: "webm" },
  { id: "gif", label: "GIF", hint: "animado, sem som", format: "gif" },
  { id: "mp3", label: "MP3", hint: "só o áudio · 192 kbps", format: "mp3" },
  { id: "wav", label: "WAV", hint: "áudio sem compressão", format: "wav" },
  { id: "png-seq", label: "PNG (.zip)", hint: "sequência de quadros", format: "png-seq" },
];

export function ExportProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useVideoEditor((s) => s.project);
  const sources = useVideoEditor((s) => s.sources);

  const [formatId, setFormatId] = useState<string>("mp4");
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]["id"]>("1080p");
  const [fps, setFps] = useState<(typeof FPS_OPTIONS)[number]>(30);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const chosen = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  const format: ExportFormat = chosen.format;
  const isAudioOnly = format === "mp3" || format === "wav";
  const supported = isExportSupported();
  const durationMs = projectDurationMs(project.tracks);
  const heavyRes = !isAudioOnly && (resolution === "1440p" || resolution === "2160p" || resolution === "4320p");

  // sincroniza com a resolução padrão escolhida no topo do Estúdio
  useEffect(() => {
    if (open) setResolution(readDefaultRes());
  }, [open]);

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
        container: chosen.container,
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
      toast(
        format === "video"
          ? "Vídeo exportado"
          : format === "gif"
            ? "GIF exportado"
            : format === "mp3" || format === "wav"
              ? "Áudio exportado"
              : "Sequência PNG exportada",
        { description: format === "video" ? `${result.fileName} — com áudio mixado` : result.fileName },
      );
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
                onClick={() => setFormatId(f.id)}
                disabled={exporting}
                aria-pressed={formatId === f.id}
                className={cn(
                  "rounded-xl border px-2 py-2 text-left text-xs transition-colors",
                  formatId === f.id ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
                )}
              >
                <span className="block font-semibold">{f.label}</span>
                <span className="text-[10px] text-zinc-500">{f.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={cn(isAudioOnly && "hidden")}>
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

        <div className={cn(isAudioOnly && "hidden")}>
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
          {formatId === "mp4"
            ? "MP4 (H.264 + AAC) — o mais compatível com redes sociais. Se o navegador não codificar H.264, avisamos e o WebM resolve."
            : formatId === "webm"
              ? "WebM (VP9 + Opus) — sempre disponível e toca em qualquer player moderno."
              : format === "gif"
                ? "GIF animado (sem som), reduzido para ~480px e ~15 fps para o arquivo não ficar gigante."
                : format === "mp3"
                  ? "Só o áudio do projeto (vozes + músicas mixadas) em MP3 192 kbps — codificado no seu aparelho."
                  : format === "wav"
                    ? "Só o áudio do projeto em WAV 16-bit sem compressão (arquivo maior, qualidade máxima)."
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
