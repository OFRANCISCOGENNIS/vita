"use client";

// Filtros tab — 12 parametric looks with live thumbnails + intensity slider.
// Thumbnails run the real pipeline on a tiny (~180px) copy of the preview, so
// they show the actual look on THIS photo (base pixels, before user tweaks).

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTERS, downscaleToMax, neutralParams, renderPhoto, type FilterId } from "@/lib/photo-engine";
import { getPreviewCanvas, usePhotoEditorStore } from "@/store/photo-editor";
import { Slider } from "@/components/ui/slider";

export function FiltrosPanel() {
  const filter = usePhotoEditorStore((s) => s.params.filter);
  const setFilter = usePhotoEditorStore((s) => s.setFilter);
  const version = usePhotoEditorStore((s) => s.version);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    const prev = getPreviewCanvas();
    if (!prev) return;
    // ~180px wide thumb source — 12 pipeline runs at this size cost ~a frame.
    const small = downscaleToMax(prev, 180 * 180);
    const dest = document.createElement("canvas");
    const out: Record<string, string> = {};
    const plain = neutralParams();
    renderPhoto(small, plain, dest);
    out.none = dest.toDataURL("image/jpeg", 0.7);
    for (const f of FILTERS) {
      const p = neutralParams();
      p.filter = { id: f.id, intensity: 100 };
      renderPhoto(small, p, dest);
      out[f.id] = dest.toDataURL("image/jpeg", 0.7);
    }
    setThumbs(out);
  }, [version]);

  function pick(id: FilterId | null) {
    setFilter({ ...filter, id });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtros / Looks</h3>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Escolha de filtro">
        <button
          onClick={() => pick(null)}
          aria-pressed={filter.id === null}
          className={cn(
            "group overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            filter.id === null ? "border-violet-500/70 ring-1 ring-violet-500/50" : "border-line hover:border-zinc-500",
          )}
        >
          {thumbs.none ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbs.none} alt="" aria-hidden className="aspect-square w-full object-cover" />
          ) : (
            <span className="flex aspect-square w-full items-center justify-center bg-surface-2">
              <Ban className="h-4 w-4 text-zinc-600" aria-hidden />
            </span>
          )}
          <span className="block truncate px-1.5 py-1 text-[10px] font-medium text-zinc-300">Sem filtro</span>
        </button>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => pick(f.id)}
            aria-pressed={filter.id === f.id}
            className={cn(
              "group overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
              filter.id === f.id ? "border-violet-500/70 ring-1 ring-violet-500/50" : "border-line hover:border-zinc-500",
            )}
          >
            {thumbs[f.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[f.id]} alt="" aria-hidden className="aspect-square w-full object-cover" />
            ) : (
              <span className="block aspect-square w-full animate-pulse bg-surface-2" aria-hidden />
            )}
            <span className="block truncate px-1.5 py-1 text-[10px] font-medium text-zinc-300">{f.label}</span>
          </button>
        ))}
      </div>

      {filter.id !== null && (
        <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
          <Slider
            label={`Intensidade — ${FILTERS.find((f) => f.id === filter.id)?.label ?? ""}`}
            min={0}
            max={100}
            value={filter.intensity}
            onChange={(v) => setFilter({ ...filter, intensity: v })}
          />
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Os filtros são paramétricos: combinam ajustes, curvas por canal e mixagens P&amp;B/sépia — e somam-se aos seus ajustes manuais.
      </p>
    </div>
  );
}
