"use client";

// Render queue: per-cut simulated worker progress, ETA, downloads
// (video / .srt / thumbnail / description .txt) and batch .zip.

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  Captions,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import * as api from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { toast } from "@/store/toast";
import { useRenderQueueStore, type RenderItem } from "@/store/render-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";

function downloadMock(kind: string, item: RenderItem) {
  // Simulated download — in production these are presigned MinIO URLs.
  toast(`Download iniciado: ${kind}`, {
    description: `"${item.cutTitle}" (${item.resolution} ${item.fps}fps ${item.codec.toUpperCase()})`,
    variant: "info",
  });
}

export default function ExportsPage() {
  const { items, remove } = useRenderQueueStore();
  const [zipping, setZipping] = useState(false);

  const done = items.filter((i) => i.status === "done");
  const active = items.filter((i) => i.status === "running" || i.status === "queued");

  async function downloadAllZip() {
    setZipping(true);
    try {
      const { zipUrl } = await api.batchZip(done.map((d) => d.id));
      toast("Pacote .zip pronto!", {
        description: `${done.length} exportações agrupadas: ${zipUrl}`,
      });
    } catch {
      toast("Falha ao gerar o .zip", { variant: "error" });
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Exportações</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {active.length > 0
              ? `${active.length} ${active.length === 1 ? "renderização em andamento" : "renderizações em andamento"}`
              : "Fila de renderização e downloads"}
          </p>
        </div>
        {done.length > 1 && (
          <Button variant="secondary" onClick={downloadAllZip} loading={zipping}>
            <Archive className="h-4 w-4" aria-hidden /> Baixar tudo (.zip)
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          variant="queue"
          title="Nenhuma exportação ainda"
          description="Abra um corte no editor e clique em Exportar para começar a fila de renderização."
          action={
            <Link
              href="/app/projetos"
              className="inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white"
            >
              Ver meus projetos
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line bg-surface-1 p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                    ) : (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-400" aria-hidden />
                    )}
                    <h3 className="truncate text-sm font-semibold text-white">{item.cutTitle}</h3>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.projectTitle} · {item.resolution} · {item.fps}fps · {item.codec === "h264" ? "H.264" : "H.265"} ·{" "}
                    {item.preset === "maxima-qualidade" ? "máxima qualidade" : "padrão"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.status === "done" ? "success" : item.status === "error" ? "danger" : "info"}>
                    {item.status === "done" ? "Concluído" : item.status === "error" ? "Erro" : item.status === "queued" ? "Na fila" : "Renderizando"}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => remove(item.id)} aria-label="Remover da fila">
                    <Trash2 className="h-4 w-4 text-zinc-500 hover:text-rose-400" />
                  </Button>
                </div>
              </div>

              {item.status !== "done" && (
                <div className="mt-4">
                  <Progress value={item.progress} label={`Renderização de ${item.cutTitle}`} />
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
                    <Clock className="h-3 w-3" aria-hidden />
                    {item.progress}% — tempo restante estimado: {formatDuration(item.etaSeconds)}
                  </p>
                </div>
              )}

              {item.status === "done" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => downloadMock("vídeo MP4", item)}>
                    <Download className="h-3.5 w-3.5" aria-hidden /> Vídeo
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadMock("legenda .srt", item)}>
                    <Captions className="h-3.5 w-3.5" aria-hidden /> .srt
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadMock("thumbnail", item)}>
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Thumbnail
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadMock("descrição .txt", item)}>
                    <FileText className="h-3.5 w-3.5" aria-hidden /> Descrição .txt
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
