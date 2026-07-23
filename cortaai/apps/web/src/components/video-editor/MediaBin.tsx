"use client";

// Importação de mídia: botão + arrastar-e-soltar. Cada arquivo vira um
// MediaSource (blob no IndexedDB + metadados) e é emendado na timeline.

import { useRef, useState, type DragEvent } from "react";
import { Film, ImagePlus, Loader2, Music2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileKind, registerFile, type MediaSource } from "@/lib/video-editor/media-registry";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

export function MediaBin() {
  const sources = useVideoEditor((s) => s.sources);
  const addClipFromSource = useVideoEditor((s) => s.addClipFromSource);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => fileKind(f));
    if (list.length === 0) {
      toast("Formato não suportado", { description: "Envie vídeo, imagem ou áudio.", variant: "error" });
      return;
    }
    setImporting(true);
    try {
      for (const file of list) {
        const source = await registerFile(file);
        if (source) addClipFromSource(source);
      }
      toast("Mídia importada", { description: `${list.length} item(ns) na timeline.` });
    } catch {
      toast("Falha ao importar", { variant: "error" });
    } finally {
      setImporting(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
  }

  const items = Object.values(sources);

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-all",
          dragOver
            ? "scale-[1.02] border-violet-400 bg-violet-500/10 shadow-glow"
            : "border-white/10 bg-white/[0.03] hover:border-violet-500/40 hover:bg-white/[0.05]",
        )}
      >
        {importing ? (
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" aria-hidden />
        ) : (
          <Upload className="h-6 w-6 text-zinc-500" aria-hidden />
        )}
        <p className="text-xs text-zinc-400">Arraste vídeos, imagens ou áudio aqui</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={importing}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 active:scale-95 disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Escolher arquivos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          className="sr-only"
          aria-label="Importar mídia"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {items.map((src, i) => (
            <div key={src.id} className="anim-pop" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
              <MediaThumb source={src} onAdd={() => addClipFromSource(src)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaThumb({ source, onAdd }: { source: MediaSource; onAdd: () => void }) {
  const Icon = source.kind === "audio" ? Music2 : source.kind === "image" ? ImagePlus : Film;
  return (
    <button
      onClick={onAdd}
      title={`Adicionar "${source.name}" à timeline`}
      className="group relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black transition-all hover:scale-[1.04] hover:border-violet-400/60 hover:shadow-glow active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      {source.posterDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source.posterDataUrl} alt="" className="h-full w-full object-cover opacity-80 group-hover:opacity-100" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Icon className="h-5 w-5 text-zinc-600" aria-hidden />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-[9px] text-zinc-200">{source.name}</span>
    </button>
  );
}
