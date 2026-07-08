"use client";

// Reusable image dropzone. Accepts a dropped/selected file and reports a usable
// URL (an object URL for real files). Offers an "usar imagem de exemplo" button
// that falls back to a local SVG data-URI so the flow works without any asset.

import { useCallback, useId, useRef, useState } from "react";
import { ImagePlus, Sparkles, X } from "lucide-react";
import { cn, svgThumb } from "@/lib/utils";

interface ImageDropzoneProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  sampleLabel?: string;
  sampleNiche?: string;
  className?: string;
  aspect?: string; // tailwind aspect class, default aspect-video
}

export function ImageDropzone({
  label,
  value,
  onChange,
  sampleLabel = "Imagem de exemplo",
  sampleNiche = "tecnologia",
  className,
  aspect = "aspect-video",
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      onChange(URL.createObjectURL(file));
    },
    [onChange],
  );

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Remover
          </button>
        )}
      </div>

      {value ? (
        <div className={cn("relative overflow-hidden rounded-xl border border-line bg-surface-2", aspect)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={`${label}: solte uma imagem ou clique para selecionar`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            aspect,
            dragging ? "border-violet-500 bg-violet-500/10" : "border-line bg-surface-2 hover:border-zinc-600",
          )}
        >
          <ImagePlus className="h-7 w-7 text-zinc-500" aria-hidden />
          <p className="text-xs text-zinc-400">
            Arraste uma imagem ou <span className="font-medium text-violet-300">clique para enviar</span>
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(svgThumb(sampleLabel, sampleNiche));
            }}
            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] text-zinc-300 hover:border-violet-500/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Sparkles className="h-3 w-3" aria-hidden /> Usar imagem de exemplo
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        id={fieldId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0] ?? undefined)}
      />
    </div>
  );
}
