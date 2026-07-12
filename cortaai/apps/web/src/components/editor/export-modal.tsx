"use client";

// Export modal: resolution / fps / codec / quality preset → render queue.
// The source is never upscaled — options above the source resolution are locked.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Rocket, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { useRenderQueueStore } from "@/store/render-queue";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const RESOLUTIONS = [
  { id: "2160p", label: "4K vertical", detail: "2160×3840" },
  { id: "1080p", label: "Full HD", detail: "1080×1920" },
  { id: "720p", label: "HD", detail: "720×1280" },
] as const;

export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { cut, doc } = useEditorStore();
  const enqueue = useRenderQueueStore((s) => s.enqueue);
  const processing = doc.processing;

  const [resolution, setResolution] = useState<string>("2160p");
  const [fps, setFps] = useState<30 | 60>(60);
  const [codec, setCodec] = useState<"h264" | "h265">("h265");
  const [maxQuality, setMaxQuality] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!cut) return null;

  function applyMaxPreset() {
    setResolution("2160p");
    setFps(60);
    setCodec("h265");
    setMaxQuality(true);
  }

  async function confirm() {
    if (!cut) return;
    setSubmitting(true);
    try {
      const project = await api.getProject(cut.projectId).catch(() => null);
      // Estabilização / enhance entram no rótulo do preset para aparecerem na fila.
      const extras = [
        processing.stabilize ? `estabilizado ${processing.stabilizeStrength}%` : "",
        processing.enhance ? `enhance→${processing.upscaleTarget}` : "",
      ].filter(Boolean);
      const preset = [maxQuality ? "maxima-qualidade" : "padrao", ...extras].join(" · ");
      await enqueue({
        cutId: cut.id,
        cutTitle: cut.title,
        projectTitle: project?.title ?? "Projeto",
        resolution,
        fps,
        codec,
        preset,
      });
      onClose();
      router.push("/app/exportacoes");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exportar clipe"
      description={`"${cut.title}" será renderizado com legendas, capa e descrição.`}
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Resolução</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Resolução de exportação">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setResolution(r.id)}
                aria-pressed={resolution === r.id}
                className={cn(
                  "rounded-xl border p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  resolution === r.id ? "border-violet-500/60 bg-violet-500/10" : "border-line bg-surface-1 hover:border-violet-500/40",
                )}
              >
                <span className="block text-sm font-bold text-white">{r.label}</span>
                <span className="text-[10px] text-zinc-500">{r.detail}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Quadros por segundo</p>
            <div className="flex gap-2" role="group" aria-label="FPS">
              {([30, 60] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFps(f)}
                  aria-pressed={fps === f}
                  className={cn(
                    "flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    fps === f ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                  )}
                >
                  {f}fps
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Codec</p>
            <div className="flex gap-2" role="group" aria-label="Codec de vídeo">
              {(["h264", "h265"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCodec(c)}
                  aria-pressed={codec === c}
                  className={cn(
                    "flex-1 rounded-xl border py-2 text-sm font-semibold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    codec === c ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                  )}
                >
                  {c === "h264" ? "H.264" : "H.265"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={applyMaxPreset}
          aria-pressed={maxQuality && resolution === "2160p" && fps === 60 && codec === "h265"}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            maxQuality && resolution === "2160p"
              ? "border-fuchsia-500/60 bg-gradient-to-r from-violet-600/15 to-fuchsia-600/15"
              : "border-line hover:border-fuchsia-500/40",
          )}
        >
          <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-400" aria-hidden />
          <span>
            <span className="block text-sm font-bold text-white">Preset &ldquo;Máxima qualidade&rdquo;</span>
            <span className="text-xs text-zinc-500">4K vertical · 60fps · H.265 · bitrate alto · 2 passadas</span>
          </span>
        </button>

        {/* Pós-processamento salvo no documento (estabilização + enhance/upscale) */}
        {(processing.stabilize || processing.enhance) && (
          <div className="space-y-1 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 text-xs text-fuchsia-100">
            <p className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 shrink-0 text-fuchsia-400" aria-hidden /> Pós-processamento
            </p>
            <ul className="ml-6 list-disc space-y-0.5 text-fuchsia-200/90">
              {processing.stabilize && <li>Estabilização · força {processing.stabilizeStrength}%</li>}
              {processing.enhance && <li>Enhance / upscale para {processing.upscaleTarget}</li>}
            </ul>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {processing.enhance ? (
            <>Com o Enhance ligado, a origem é ampliada até {processing.upscaleTarget} (upscale reprocessado no render).</>
          ) : (
            <>A origem nunca é ampliada (sem upscale): se o vídeo original for 1080p, a exportação 4K entrega o melhor 1080p possível dentro do container escolhido.</>
          )}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} loading={submitting}>
            <Rocket className="h-4 w-4" aria-hidden /> Confirmar e renderizar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
