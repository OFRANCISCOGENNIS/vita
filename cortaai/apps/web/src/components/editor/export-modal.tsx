"use client";

// Export modal: renderização REAL no navegador (WebCodecs) — o arquivo de
// vídeo é composto quadro a quadro com as edições queimadas e baixado na hora.
// Sem WebCodecs (Safari antigo), mostra um aviso honesto — nada de fila fake.

import { useRef, useState } from "react";
import { Download, Info, Rocket, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { exportDimensions, isExportSupported, renderCutToBlob } from "@/lib/export-render";
import { useEditorStore } from "@/store/editor";
import { useRenderQueueStore } from "@/store/render-queue";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";

const RESOLUTIONS = [
  { id: "2160p", label: "4K", shortSide: 2160, hint: "bem mais lento" },
  { id: "1080p", label: "Full HD", shortSide: 1080, hint: "recomendado" },
  { id: "720p", label: "HD", shortSide: 720, hint: "mais rápido" },
] as const;

export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cut, doc } = useEditorStore();
  const addCompleted = useRenderQueueStore((s) => s.addCompleted);

  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]["id"]>("1080p");
  const [fps, setFps] = useState<30 | 60>(30);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!cut) return null;

  const supported = isExportSupported();
  const hasMedia = Boolean(cut.mediaId || cut.mediaUrl);
  const shortSide = RESOLUTIONS.find((r) => r.id === resolution)?.shortSide ?? 1080;
  const dims = exportDimensions(doc.aspect, shortSide);

  async function startExport() {
    if (!cut) return;
    setExporting(true);
    setProgress({ pct: 0, message: "Preparando…" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await renderCutToBlob(cut, doc, {
        shortSide,
        fps,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      // Download imediato do arquivo renderizado.
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      const project = await api.getProject(cut.projectId).catch(() => null);
      addCompleted({
        cutId: cut.id,
        cutTitle: cut.title,
        projectTitle: project?.title ?? "Projeto",
        resolution,
        fps,
        codec: "h264",
        preset: result.mimeType === "video/mp4" ? "mp4 (navegador)" : "webm (navegador)",
      });
      toast("Vídeo exportado!", {
        description: `"${result.fileName}" foi baixado com as edições aplicadas (${dims.width}×${dims.height}, ${fps}fps).`,
      });
      onClose();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast("Exportação cancelada", { variant: "info" });
      } else {
        toast("Falha na exportação", {
          description: err instanceof Error ? err.message : "Tente novamente em uma resolução menor.",
          variant: "error",
        });
      }
    } finally {
      abortRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  }

  function cancelExport() {
    abortRef.current?.abort();
  }

  return (
    <Modal
      open={open}
      onClose={exporting ? () => undefined : onClose}
      title="Exportar clipe"
      description={`"${cut.title}" será renderizado neste navegador, com as edições queimadas no arquivo.`}
    >
      <div className="space-y-5">
        {!supported && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Seu navegador não suporta renderização local (WebCodecs). Use Chrome, Edge ou um Android
            recente para exportar o vídeo final. Os downloads de legenda (.srt), descrição e thumbnail
            continuam disponíveis em Exportações.
          </p>
        )}
        {supported && !hasMedia && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Este clipe não tem mídia reproduzível neste navegador — envie o vídeo de novo em Novo
            projeto para exportar.
          </p>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Resolução</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Resolução de exportação">
            {RESOLUTIONS.map((r) => {
              const d = exportDimensions(doc.aspect, r.shortSide);
              return (
                <button
                  key={r.id}
                  onClick={() => setResolution(r.id)}
                  aria-pressed={resolution === r.id}
                  disabled={exporting}
                  className={cn(
                    "rounded-xl border p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50",
                    resolution === r.id ? "border-violet-500/60 bg-violet-500/10" : "border-line bg-surface-1 hover:border-violet-500/40",
                  )}
                >
                  <span className="block text-sm font-bold text-white">{r.label}</span>
                  <span className="text-[10px] text-zinc-500">
                    {d.width}×{d.height} · {r.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Quadros por segundo</p>
          <div className="flex gap-2" role="group" aria-label="FPS">
            {([30, 60] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFps(f)}
                aria-pressed={fps === f}
                disabled={exporting}
                className={cn(
                  "flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50",
                  fps === f ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                )}
              >
                {f}fps
              </button>
            ))}
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          O arquivo sai em MP4 (H.264) quando o navegador suporta; senão em WebM. Ficam queimados no
          vídeo: recorte, proporção/reenquadramento, cores e filtros, velocidade, legendas, headline,
          stickers, barra de progresso, marca d&rsquo;água e o áudio com fades. Efeitos de movimento,
          máscaras, chroma key e overlays ainda não entram no arquivo final (aparecem só no preview).
        </p>

        {/* Progresso da renderização real */}
        {exporting && progress && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4" role="status" aria-live="polite">
            <p className="mb-2 text-sm text-violet-200">{progress.message}</p>
            <Progress value={progress.pct} label="Progresso da exportação" />
          </div>
        )}

        <div className="flex justify-end gap-2">
          {exporting ? (
            <Button variant="secondary" onClick={cancelExport}>
              <XCircle className="h-4 w-4" aria-hidden /> Cancelar
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
              <Button onClick={startExport} disabled={!supported || !hasMedia}>
                {supported ? (
                  <>
                    <Download className="h-4 w-4" aria-hidden /> Exportar vídeo
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" aria-hidden /> Indisponível neste navegador
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
