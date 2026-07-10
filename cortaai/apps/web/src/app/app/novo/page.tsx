"use client";

// New project: drag-and-drop chunked upload (simulated) + URL import with
// instant preview, quality selector and parallel import queue.

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  FileVideo,
  Languages,
  LinkIcon,
  Loader2,
  Pause,
  Play,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import * as api from "@/lib/api";
import type { Language, Resolution, UrlPreview } from "@/lib/types";
import { probeVideoFile, probeVideoSrc, saveMedia } from "@/lib/media-store";
import { cn, formatBytes, formatDuration, svgThumb, uid } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

const ACCEPTED = [".mp4", ".mov", ".mkv", ".webm"];
const MAX_BYTES = 10 * 1024 ** 3; // 10 GB
/** Direct, browser-playable video links (streamed as-is, no backend needed). */
const DIRECT_VIDEO_RE = /\.(mp4|webm)(\?.*)?$/i;

interface QueueItem {
  id: string;
  kind: "upload" | "url";
  name: string;
  sizeBytes: number;
  progress: number; // 0-100
  speedMBps: number;
  etaSeconds: number;
  status: "enviando" | "pausado" | "processando" | "concluído" | "erro";
  language: Language;
  projectId?: string;
}

const LANGUAGES: { id: Language; label: string }[] = [
  { id: "auto", label: "Detectar automaticamente" },
  { id: "pt-BR", label: "Português (Brasil)" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];

export default function NewProjectPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState<Language>("auto");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef(new Map<string, ReturnType<typeof setInterval>>());
  // Real uploaded File objects kept by uploadId until the "upload" simulation
  // completes and we persist the blob to IndexedDB.
  const filesRef = useRef(new Map<string, File>());

  // URL import state
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | undefined>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [previewIsDirect, setPreviewIsDirect] = useState(false);
  const [quality, setQuality] = useState<Resolution>("1080p");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearInterval(t));
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem> | ((i: QueueItem) => Partial<QueueItem>)) => {
    setQueue((q) =>
      q.map((i) => (i.id === id ? { ...i, ...(typeof patch === "function" ? patch(i) : patch) } : i)),
    );
  }, []);

  /**
   * On upload completion: probe the real File (duration + poster frame), persist
   * the blob to IndexedDB under a mediaId, then register a READY project + a
   * default full-length cut carrying that mediaId — so the editor replays the
   * real video. Degrades gracefully if the File or storage is unavailable.
   */
  const finalizeUpload = useCallback(
    async (uploadId: string, filename: string, language: Language) => {
      const file = filesRef.current.get(uploadId);
      let mediaId: string | undefined;
      let durationSeconds = 0;
      let thumbnailUrl: string | undefined;
      if (file) {
        const probe = await probeVideoFile(file).catch(() => ({ durationSeconds: 0, posterDataUrl: null }));
        durationSeconds = probe.durationSeconds;
        thumbnailUrl = probe.posterDataUrl ?? undefined;
        mediaId = uid();
        try {
          await saveMedia(mediaId, file);
        } catch {
          mediaId = undefined; // storage blocked (private mode/quota) — no playable media
        }
      }
      const project = await api.uploadComplete(uploadId, filename, {
        mediaId,
        durationSeconds,
        thumbnailUrl,
        language,
      });
      filesRef.current.delete(uploadId);
      updateItem(uploadId, { status: "concluído", progress: 100, etaSeconds: 0, projectId: project.id });
      toast("Upload concluído!", {
        description: mediaId
          ? `"${filename}" está pronto — abra o projeto para editar com o vídeo real.`
          : `"${filename}" foi registrado (armazenamento local indisponível para o vídeo).`,
      });
    },
    [updateItem],
  );

  /** Simulated chunked upload/import with realistic speed jitter, pause/resume. */
  const startSimulation = useCallback(
    (id: string, kind: "upload" | "url", sizeBytes: number, filename: string) => {
      const timer = setInterval(() => {
        setQueue((q) => {
          const item = q.find((i) => i.id === id);
          if (!item || item.status === "pausado") return q;
          if (item.status === "concluído" || item.status === "erro") {
            clearInterval(timer);
            timersRef.current.delete(id);
            return q;
          }
          const speedMBps = 38 + Math.random() * 30; // fake network speed
          const stepPct = ((speedMBps * 1024 * 1024) / Math.max(sizeBytes, 1)) * 100 * 1.2;
          const progress = Math.min(100, item.progress + Math.max(1.5, stepPct));
          if (progress >= 100) {
            clearInterval(timer);
            timersRef.current.delete(id);
            // finish: register project with the API
            if (kind === "upload") {
              void finalizeUpload(id, filename, item.language);
            } else {
              // URL projects were already created in startImport (projectId set).
              updateItem(id, { status: "concluído", progress: 100, etaSeconds: 0 });
              toast("Importação concluída!", { description: `"${filename}" está pronto.` });
            }
            return q.map((i) =>
              i.id === id ? { ...i, progress: 100, status: "processando" as const, etaSeconds: 0 } : i,
            );
          }
          const remainingBytes = sizeBytes * (1 - progress / 100);
          return q.map((i) =>
            i.id === id
              ? {
                  ...i,
                  progress,
                  speedMBps: Math.round(speedMBps * 10) / 10,
                  etaSeconds: Math.max(1, Math.round(remainingBytes / (speedMBps * 1024 * 1024))),
                  status: "enviando" as const,
                }
              : i,
          );
        });
      }, 700);
      timersRef.current.set(id, timer);
    },
    [updateItem, finalizeUpload],
  );

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (!ACCEPTED.includes(ext)) {
        toast("Formato não suportado", {
          description: `"${file.name}" — aceitamos MP4, MOV, MKV e WEBM.`,
          variant: "error",
        });
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast("Arquivo muito grande", {
          description: `"${file.name}" passa de 10 GB. Comprima ou divida o vídeo.`,
          variant: "error",
        });
        continue;
      }
      // Real flow: presigned chunk URLs from the API (MinIO multipart upload).
      const { uploadId, chunkSize } = await api.uploadInit(file.name, file.size, file.type);
      void chunkSize;
      // Keep the real File so we can persist it to IndexedDB on completion.
      filesRef.current.set(uploadId, file);
      const item: QueueItem = {
        id: uploadId,
        kind: "upload",
        name: file.name,
        sizeBytes: file.size || 1.2 * 1024 ** 3,
        progress: 0,
        speedMBps: 0,
        etaSeconds: 0,
        status: "enviando",
        language: defaultLanguage,
      };
      setQueue((q) => [item, ...q]);
      startSimulation(uploadId, "upload", item.sizeBytes, file.name);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  }

  function togglePause(item: QueueItem) {
    updateItem(item.id, { status: item.status === "pausado" ? "enviando" : "pausado" });
  }

  function removeItem(id: string) {
    const timer = timersRef.current.get(id);
    if (timer) clearInterval(timer);
    timersRef.current.delete(id);
    filesRef.current.delete(id);
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  async function fetchPreview() {
    const trimmed = url.trim();
    const isDirect = DIRECT_VIDEO_RE.test(trimmed);
    const validPlatform = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|twitch\.tv|vimeo\.com)\/.+/i.test(trimmed);
    if (!isDirect && !validPlatform) {
      setUrlError("Cole um link do YouTube, Twitch, Vimeo ou um link direto .mp4/.webm.");
      return;
    }
    setUrlError(undefined);
    setPreviewLoading(true);
    setPreview(null);
    setPreviewIsDirect(isDirect);
    try {
      if (isDirect) {
        // Direct video: read real duration + poster in the browser (no backend).
        const probe = await probeVideoSrc(trimmed);
        const filename = trimmed.split("/").pop()?.split("?")[0] ?? "Vídeo";
        setPreview({
          title: filename.replace(/\.[a-z0-9]+$/i, "") || "Vídeo importado",
          channel: "Link direto (.mp4/.webm)",
          durationSeconds: probe.durationSeconds,
          thumbnailUrl: probe.posterDataUrl ?? svgThumb(filename, "tecnologia"),
          availableResolutions: ["1080p"] as Resolution[],
        });
        setQuality("1080p");
      } else {
        const p = await api.urlPreview(trimmed);
        setPreview(p);
        // Suggest the maximum available resolution by default.
        const max = [...p.availableResolutions].sort((a, b) => parseInt(b) - parseInt(a))[0];
        setQuality(max);
      }
    } catch {
      setUrlError("Não conseguimos ler este link. Verifique se o vídeo é público.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function startImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const trimmed = url.trim();
      const project = previewIsDirect
        ? await api.importDirectUrl(trimmed, quality, {
            title: preview.title,
            durationSeconds: preview.durationSeconds,
            thumbnailUrl: preview.thumbnailUrl,
          })
        : await api.importUrl(trimmed, quality);
      const fakeSize = Math.max(1, preview.durationSeconds) * 2.2 * 1024 * 1024;
      const item: QueueItem = {
        id: uid(),
        kind: "url",
        name: preview.title,
        sizeBytes: fakeSize,
        progress: 0,
        speedMBps: 0,
        etaSeconds: 0,
        status: "enviando",
        language: defaultLanguage,
        projectId: project.id,
      };
      setQueue((q) => [item, ...q]);
      startSimulation(item.id, "url", fakeSize, preview.title);
      setPreview(null);
      setPreviewIsDirect(false);
      setUrl("");
      toast(previewIsDirect ? "Vídeo direto importado" : "Importação iniciada", {
        description: previewIsDirect
          ? "Link pronto — abra o projeto para editar com o vídeo real."
          : `Baixar e transcodar em ${quality} exige o backend conectado. O projeto foi criado, mas a reprodução do vídeo real não está disponível no modo demo.`,
        variant: "info",
      });
    } catch {
      toast("Falha ao iniciar a importação", { variant: "error" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Novo projeto</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Envie um arquivo ou importe por link. A IA cuida do resto.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          dragOver ? "border-violet-500 bg-violet-500/10" : "border-line bg-surface-1/60 hover:border-violet-500/50",
        )}
      >
        <UploadCloud className={cn("h-12 w-12", dragOver ? "text-violet-300" : "text-zinc-600")} aria-hidden />
        <h2 className="mt-4 text-lg font-semibold text-white">
          Arraste seu vídeo aqui
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          MP4, MOV, MKV ou WEBM · até 10 GB · upload em pedaços com retomada automática
        </p>
        <Button className="mt-5" onClick={() => fileInputRef.current?.click()}>
          <FileVideo className="h-4 w-4" aria-hidden /> Escolher arquivo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="sr-only"
          aria-label="Selecionar arquivos de vídeo"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Language auto-detect with override */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Languages className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden />
            Idioma do áudio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Select
              label="Detecção automática com ajuste manual"
              value={defaultLanguage}
              onChange={(e) => {
                setDefaultLanguage(e.target.value as Language);
                toast("Idioma atualizado", {
                  description: `Novos envios usarão: ${LANGUAGES.find((l) => l.id === e.target.value)?.label}.`,
                  variant: "info",
                });
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </Select>
            <p className="text-xs leading-relaxed text-zinc-500 sm:max-w-xs">
              Em &ldquo;automático&rdquo;, o Whisper identifica o idioma nos primeiros 30 segundos e você pode corrigir depois.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* URL import */}
      <Card>
        <CardHeader>
          <CardTitle>
            <LinkIcon className="mr-2 inline h-4 w-4 text-fuchsia-400" aria-hidden />
            Importar por link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              label="URL do vídeo (YouTube, Twitch, Vimeo ou link direto .mp4/.webm)"
              placeholder="https://youtube.com/watch?v=...  ou  https://.../video.mp4"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchPreview()}
              error={urlError}
            />
            <Button className="sm:mt-7 shrink-0" variant="secondary" onClick={fetchPreview} loading={previewLoading}>
              Buscar prévia
            </Button>
          </div>

          {previewLoading && (
            <div className="flex gap-4 rounded-xl border border-line bg-surface-2/60 p-4">
              <Skeleton className="h-24 w-40 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-8 w-40" />
              </div>
            </div>
          )}

          {preview && (
            <div className="flex flex-col gap-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:flex-row">
              <img
                src={preview.thumbnailUrl}
                alt={`Prévia: ${preview.title}`}
                className="h-24 w-40 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-white">{preview.title}</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {preview.channel} · {formatDuration(preview.durationSeconds)}
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="w-44">
                    <Select label="Qualidade de importação" value={quality} onChange={(e) => setQuality(e.target.value as Resolution)}>
                      {preview.availableResolutions.map((r) => (
                        <option key={r} value={r}>
                          {r === "2160p" ? "2160p (4K) — recomendado" : r}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button onClick={startImport} loading={importing}>
                    Importar vídeo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPreview(null)} aria-label="Descartar prévia">
                    <X className="h-4 w-4" aria-hidden /> Descartar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import queue */}
      {queue.length > 0 && (
        <section aria-labelledby="fila">
          <h2 id="fila" className="mb-4 text-lg font-bold text-white">
            Fila de importação{" "}
            <span className="text-sm font-normal text-zinc-500">({queue.length} {queue.length === 1 ? "item" : "itens em paralelo"})</span>
          </h2>
          <ul className="space-y-3">
            {queue.map((item) => (
              <li key={item.id} className="rounded-2xl border border-line bg-surface-1 p-4">
                <div className="flex items-center gap-3">
                  {item.status === "concluído" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                  ) : item.status === "processando" ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-400" aria-hidden />
                  ) : (
                    <FileVideo className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{item.name}</p>
                    <p className="text-xs text-zinc-500">
                      {item.kind === "upload" ? formatBytes(item.sizeBytes) : "importação por link"} ·{" "}
                      {item.status === "enviando" && `${item.speedMBps} MB/s · resta ${formatDuration(item.etaSeconds)}`}
                      {item.status === "pausado" && "pausado"}
                      {item.status === "processando" && "processando no servidor..."}
                      {item.status === "concluído" && "pronto"}
                      {item.status === "erro" && "erro no envio"}
                    </p>
                  </div>
                  <Badge
                    variant={
                      item.status === "concluído" ? "success" : item.status === "pausado" ? "warning" : item.status === "erro" ? "danger" : "info"
                    }
                    className="capitalize"
                  >
                    {item.status}
                  </Badge>
                  {(item.status === "enviando" || item.status === "pausado") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePause(item)}
                      aria-label={item.status === "pausado" ? "Retomar envio" : "Pausar envio"}
                    >
                      {item.status === "pausado" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                  )}
                  {item.status === "concluído" && item.projectId ? (
                    <Link
                      href={`/app/projeto?id=${item.projectId}`}
                      className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-violet-500/50 hover:text-white"
                    >
                      Abrir projeto
                    </Link>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} aria-label="Remover da fila">
                      <Trash2 className="h-4 w-4 text-zinc-500 hover:text-rose-400" />
                    </Button>
                  )}
                </div>
                {item.status !== "concluído" && (
                  <div className="mt-3">
                    <Progress value={item.progress} label={`Progresso de ${item.name}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
