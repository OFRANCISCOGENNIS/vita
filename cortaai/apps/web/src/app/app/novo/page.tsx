"use client";

// New project: drag-and-drop chunked upload (simulated) with parallel queue
// and optional client-side merge of multiple videos into one.

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Combine,
  FileVideo,
  Languages,
  Loader2,
  Pause,
  Play,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import * as api from "@/lib/api";
import type { Language } from "@/lib/types";
import { probeVideoFile, saveMedia } from "@/lib/media-store";
import {
  MergeTooLongError,
  MergeUnsupportedError,
  mergeVideos,
  type MergeProgress,
} from "@/lib/video-merge";
import { cn, formatBytes, formatDuration, uid } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

const ACCEPTED = [".mp4", ".mov", ".mkv", ".webm"];
const MAX_BYTES = 10 * 1024 ** 3; // 10 GB

interface QueueItem {
  id: string;
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

/** Realtime recording cap for the client-side merge (see lib/video-merge). */
const MERGE_MAX_SECONDS = 600;

interface MergeUi {
  phase: "preparando" | "gravando" | "finalizando" | "salvando" | "concluído" | "erro";
  fileIndex: number;
  fileCount: number;
  filePct: number;
  overallPct: number;
  error?: string;
  projectId?: string;
  title?: string;
}

export default function NewProjectPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [defaultLanguage, setDefaultLanguage] = useState<Language>("auto");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef(new Map<string, ReturnType<typeof setInterval>>());
  // Real uploaded File objects kept by uploadId until the "upload" simulation
  // completes and we persist the blob to IndexedDB.
  const filesRef = useRef(new Map<string, File>());

  // Multi-video merge state: files staged for confirmation + live progress.
  const [pendingBatch, setPendingBatch] = useState<File[] | null>(null);
  const [mergeOn, setMergeOn] = useState(true);
  const [mergeUi, setMergeUi] = useState<MergeUi | null>(null);
  const mergeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearInterval(t));
      mergeAbortRef.current?.abort();
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
      let persisted = false;
      let durationSeconds = 0;
      let thumbnailUrl: string | undefined;
      if (file) {
        const probe = await probeVideoFile(file).catch(() => ({ durationSeconds: 0, posterDataUrl: null }));
        durationSeconds = probe.durationSeconds;
        thumbnailUrl = probe.posterDataUrl ?? undefined;
        mediaId = uid();
        try {
          // false = o IndexedDB recusou (quota/modo privado, comum no iPhone);
          // o vídeo ainda fica no cache de sessão em memória, então dá para
          // editar agora — só não sobrevive a recarregar a página.
          persisted = await saveMedia(mediaId, file);
        } catch {
          persisted = false;
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
      if (mediaId && persisted) {
        toast("Upload concluído!", {
          description: `"${filename}" está pronto — abra o projeto para editar com o vídeo real.`,
        });
      } else if (mediaId) {
        toast("Vídeo disponível só nesta sessão", {
          description:
            "O navegador negou o armazenamento local (espaço ou modo privado). Você pode editar agora, mas o vídeo some se recarregar a página — libere espaço ou saia do modo privado para guardar de vez.",
          variant: "info",
        });
      } else {
        toast("Upload concluído!", {
          description: `"${filename}" foi registrado (armazenamento local indisponível para o vídeo).`,
        });
      }
    },
    [updateItem],
  );

  /** Simulated chunked upload with realistic speed jitter, pause/resume. */
  const startSimulation = useCallback(
    (id: string, sizeBytes: number, filename: string) => {
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
            void finalizeUpload(id, filename, item.language);
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
    [finalizeUpload],
  );

  async function enqueueUpload(file: File) {
    // Real flow: presigned chunk URLs from the API (MinIO multipart upload).
    const { uploadId, chunkSize } = await api.uploadInit(file.name, file.size, file.type);
    void chunkSize;
    // Keep the real File so we can persist it to IndexedDB on completion.
    filesRef.current.set(uploadId, file);
    const item: QueueItem = {
      id: uploadId,
      name: file.name,
      sizeBytes: file.size || 1.2 * 1024 ** 3,
      progress: 0,
      speedMBps: 0,
      etaSeconds: 0,
      status: "enviando",
      language: defaultLanguage,
    };
    setQueue((q) => [item, ...q]);
    startSimulation(uploadId, item.sizeBytes, file.name);
  }

  async function addFiles(files: FileList | File[]) {
    const valid: File[] = [];
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
      valid.push(file);
    }
    // Multiple videos at once → offer to merge them into ONE video (default on).
    if (valid.length >= 2) {
      setMergeOn(true);
      setPendingBatch(valid);
      return;
    }
    for (const file of valid) await enqueueUpload(file);
  }

  /** REAL client-side concat (canvas + WebAudio + MediaRecorder) → 1 project. */
  async function runMerge(files: File[]) {
    const ctrl = new AbortController();
    mergeAbortRef.current = ctrl;
    setPendingBatch(null);
    setMergeUi({ phase: "preparando", fileIndex: 0, fileCount: files.length, filePct: 0, overallPct: 0 });
    try {
      const result = await mergeVideos(files, {
        maxDurationSeconds: MERGE_MAX_SECONDS,
        signal: ctrl.signal,
        onProgress: (p: MergeProgress) =>
          setMergeUi({
            phase: p.stage,
            fileIndex: p.fileIndex,
            fileCount: p.fileCount,
            filePct: p.filePct,
            overallPct: p.overallPct,
          }),
      });
      setMergeUi((m) => (m ? { ...m, phase: "salvando", overallPct: 100, filePct: 100 } : m));
      const mediaId = uid();
      await saveMedia(mediaId, result.blob);
      const title = `Vídeo unido (${files.length} clipes)`;
      const project = await api.uploadComplete(uid(), `${title}.webm`, {
        mediaId,
        durationSeconds: result.durationSeconds,
        thumbnailUrl: result.posterDataUrl ?? undefined,
        language: defaultLanguage,
      });
      setMergeUi({
        phase: "concluído",
        fileIndex: files.length - 1,
        fileCount: files.length,
        filePct: 100,
        overallPct: 100,
        projectId: project.id,
        title,
      });
      toast("Vídeos unidos!", {
        description: `${files.length} clipes viraram um vídeo único de ${formatDuration(result.durationSeconds)}.`,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMergeUi(null);
        return;
      }
      if (e instanceof MergeTooLongError) {
        setMergeUi(null);
        setPendingBatch(files); // reopen the panel so the toggle can be turned off
        toast("Duração total acima de 10 minutos", {
          description: `Os clipes somam ${formatDuration(e.totalSeconds)}. A união no navegador grava em tempo real e é limitada a 10 min — desative a união ou envie menos clipes.`,
          variant: "error",
        });
        return;
      }
      if (e instanceof MergeUnsupportedError) {
        setMergeUi(null);
        toast("União indisponível neste navegador", {
          description:
            "MediaRecorder/captureStream não são suportados aqui. Enviamos apenas o primeiro vídeo; os demais podem ser enviados separadamente.",
          variant: "error",
        });
        await enqueueUpload(files[0]);
        return;
      }
      setMergeUi({
        phase: "erro",
        fileIndex: 0,
        fileCount: files.length,
        filePct: 0,
        overallPct: 0,
        error: e instanceof Error ? e.message : "Erro inesperado ao unir os vídeos.",
      });
    } finally {
      mergeAbortRef.current = null;
    }
  }

  const mergeRetryFilesRef = useRef<File[]>([]);
  function startBatch() {
    const files = pendingBatch;
    if (!files) return;
    if (!mergeOn) {
      setPendingBatch(null);
      files.forEach((f) => void enqueueUpload(f));
      return;
    }
    mergeRetryFilesRef.current = files;
    void runMerge(files);
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

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Novo vídeo</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Envie um ou mais vídeos do seu dispositivo para começar a editar.
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

      {/* Multi-video batch: merge into ONE video (default) or upload each */}
      {pendingBatch && (
        <Card className="border-violet-500/40">
          <CardHeader>
            <CardTitle>
              <Combine className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden />
              {pendingBatch.length} vídeos selecionados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1.5">
              {pendingBatch.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm text-zinc-300">
                  <FileVideo className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
              <Switch
                checked={mergeOn}
                onChange={setMergeOn}
                label="Juntar tudo em um vídeo só"
                description="Une os clipes em sequência, no navegador (gravação em tempo real, limite de 10 min no total). Desligado: cria um projeto por arquivo."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={startBatch}>
                {mergeOn ? (
                  <>
                    <Combine className="h-4 w-4" aria-hidden /> Unir e criar projeto
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" aria-hidden /> Enviar separadamente
                  </>
                )}
              </Button>
              <Button variant="ghost" onClick={() => setPendingBatch(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merge progress / result */}
      {mergeUi && (
        <Card className="border-fuchsia-500/40">
          <CardContent className="pt-5">
            {mergeUi.phase === "erro" ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-rose-300">Falha ao unir os vídeos</p>
                <p className="text-xs text-zinc-400">{mergeUi.error}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void runMerge(mergeRetryFilesRef.current)}>
                    Tentar novamente
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMergeUi(null)}>
                    Descartar
                  </Button>
                </div>
              </div>
            ) : mergeUi.phase === "concluído" ? (
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100">{mergeUi.title}</p>
                  <p className="text-xs text-zinc-500">
                    {mergeUi.fileCount} clipes unidos em um único vídeo — pronto para editar.
                  </p>
                </div>
                {mergeUi.projectId && (
                  <Link
                    href={`/app/projeto?id=${mergeUi.projectId}`}
                    className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-violet-500/50 hover:text-white"
                  >
                    Abrir projeto
                  </Link>
                )}
                <Button variant="ghost" size="icon" onClick={() => setMergeUi(null)} aria-label="Fechar resultado da união">
                  <X className="h-4 w-4 text-zinc-500" />
                </Button>
              </div>
            ) : (
              <div className="space-y-3" role="status" aria-live="polite">
                <p className="flex items-center gap-2 text-sm text-fuchsia-200">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {mergeUi.phase === "preparando" && "Preparando a união (lendo os clipes)…"}
                  {mergeUi.phase === "gravando" &&
                    `Gravando clipe ${mergeUi.fileIndex + 1} de ${mergeUi.fileCount} — a união roda em tempo real`}
                  {(mergeUi.phase === "finalizando" || mergeUi.phase === "salvando") &&
                    "Finalizando e salvando o vídeo único…"}
                </p>
                {mergeUi.phase === "gravando" && (
                  <Progress value={mergeUi.filePct} label={`Progresso do clipe ${mergeUi.fileIndex + 1}`} />
                )}
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Progresso total</p>
                  <Progress value={mergeUi.overallPct} label="Progresso total da união" />
                </div>
                <Button size="sm" variant="ghost" onClick={() => mergeAbortRef.current?.abort()}>
                  Cancelar união
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              O idioma fica salvo como metadado do projeto e você pode corrigir depois.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Import queue */}
      {queue.length > 0 && (
        <section aria-labelledby="fila">
          <h2 id="fila" className="mb-4 text-lg font-bold text-white">
            Fila de envio{" "}
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
                      {formatBytes(item.sizeBytes)} ·{" "}
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
