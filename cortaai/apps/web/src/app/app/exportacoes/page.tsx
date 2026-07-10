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
import type { Cut } from "@/lib/types";
import { formatDuration, svgThumb } from "@/lib/utils";
import { toast } from "@/store/toast";
import { useRenderQueueStore, type RenderItem } from "@/store/render-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";

// Only the fields we need to build real client-side export artifacts.
type ExportCut = Pick<Cut, "title" | "description" | "hashtags" | "transcript" | "startSeconds" | "endSeconds">;

/** Resolve a queue item to its cut; falls back to a minimal shape if missing. */
async function resolveCut(item: RenderItem): Promise<ExportCut> {
  try {
    return await api.getCut(item.cutId);
  } catch {
    return { title: item.cutTitle, description: "", hashtags: [], transcript: [], startSeconds: 0, endSeconds: 0 };
  }
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "corte"
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function srtTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(ss)},${pad(ms, 3)}`;
}

/** Build a .srt from the cut's transcript (clip-relative), or a 1-line fallback. */
function buildSrt(cut: ExportCut): string {
  const words = cut.transcript ?? [];
  if (words.length === 0) {
    const dur = Math.max(2, (cut.endSeconds ?? 0) - (cut.startSeconds ?? 0)) || 3;
    return `1\n${srtTime(0)} --> ${srtTime(dur)}\n${cut.title || "Legenda"}\n`;
  }
  const base = cut.startSeconds ?? 0;
  const cues: (typeof words)[] = [];
  for (let i = 0; i < words.length; i += 7) cues.push(words.slice(i, i + 7));
  return cues
    .map((cue, idx) => {
      const start = Math.max(0, (cue[0].start ?? 0) - base);
      const end = Math.max(start + 0.5, (cue[cue.length - 1].end ?? start + 1) - base);
      const text = cue.map((w) => w.word).join(" ").trim();
      return `${idx + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${text}\n`;
    })
    .join("\n");
}

/** Description .txt: title + description + hashtags. */
function buildDescription(cut: ExportCut): string {
  const parts: string[] = [cut.title || "Corte"];
  if (cut.description) parts.push("", cut.description);
  if (cut.hashtags && cut.hashtags.length) parts.push("", cut.hashtags.join(" "));
  return parts.join("\n") + "\n";
}

/** Rasterize a generated SVG thumbnail to a PNG Blob (no external assets). */
function buildThumbPng(title: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, 1280, 720);
          canvas.toBlob((b) => resolve(b), "image/png");
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = svgThumb(title, "tecnologia", 1280, 720);
    } catch {
      resolve(null);
    }
  });
}

export default function ExportsPage() {
  const { items, remove } = useRenderQueueStore();
  const [zipping, setZipping] = useState(false);

  const done = items.filter((i) => i.status === "done");
  const active = items.filter((i) => i.status === "running" || i.status === "queued");

  async function downloadSrt(item: RenderItem) {
    const cut = await resolveCut(item);
    triggerDownload(new Blob([buildSrt(cut)], { type: "application/x-subrip" }), `${slug(cut.title)}.srt`);
    toast("Legenda .srt baixada", { description: `"${item.cutTitle}"`, variant: "success" });
  }

  async function downloadTxt(item: RenderItem) {
    const cut = await resolveCut(item);
    triggerDownload(new Blob([buildDescription(cut)], { type: "text/plain;charset=utf-8" }), `${slug(cut.title)}-descricao.txt`);
    toast("Descrição .txt baixada", { description: `"${item.cutTitle}"`, variant: "success" });
  }

  async function downloadThumb(item: RenderItem) {
    const cut = await resolveCut(item);
    const png = await buildThumbPng(cut.title);
    if (!png) {
      toast("Não foi possível gerar a thumbnail", { variant: "error" });
      return;
    }
    triggerDownload(png, `${slug(cut.title)}-thumb.png`);
    toast("Thumbnail .png baixada", { description: `"${item.cutTitle}"`, variant: "success" });
  }

  function downloadVideo(item: RenderItem) {
    // The final rendered video is encoded server-side (FFmpeg) — not available
    // on the static build. Be honest instead of faking a download.
    toast("Vídeo final indisponível no modo demo", {
      description: `"${item.cutTitle}": o vídeo final renderizado requer o backend conectado.`,
      variant: "info",
    });
  }

  async function downloadAllZip() {
    // No zip dependency available: download the real per-cut artifacts
    // (.srt + descrição .txt + thumbnail .png) sequentially for each item.
    setZipping(true);
    try {
      for (const item of done) {
        const cut = await resolveCut(item);
        triggerDownload(new Blob([buildSrt(cut)], { type: "application/x-subrip" }), `${slug(cut.title)}.srt`);
        triggerDownload(
          new Blob([buildDescription(cut)], { type: "text/plain;charset=utf-8" }),
          `${slug(cut.title)}-descricao.txt`,
        );
        const png = await buildThumbPng(cut.title);
        if (png) triggerDownload(png, `${slug(cut.title)}-thumb.png`);
        await new Promise((r) => setTimeout(r, 350)); // space out browser downloads
      }
      toast("Artefatos baixados", {
        description: `${done.length} corte(s): .srt, descrição .txt e thumbnail .png de cada. O vídeo final renderizado requer o backend conectado.`,
        variant: "success",
      });
    } catch {
      toast("Falha ao baixar os artefatos", { variant: "error" });
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
            <Archive className="h-4 w-4" aria-hidden /> Baixar artefatos
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
                  <Button size="sm" onClick={() => downloadVideo(item)}>
                    <Download className="h-3.5 w-3.5" aria-hidden /> Vídeo
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadSrt(item)}>
                    <Captions className="h-3.5 w-3.5" aria-hidden /> .srt
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadThumb(item)}>
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Thumbnail
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadTxt(item)}>
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
