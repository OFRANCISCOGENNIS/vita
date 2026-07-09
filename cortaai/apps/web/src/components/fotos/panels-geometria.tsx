"use client";

// Recortar tab — crop (livre + proporções, com overlay arrastável no palco),
// rotação fina (endireitar) + 90°, espelhar H/V, redimensionar (bicúbico por
// etapas), estender bordas com cor de fundo e perspectiva/inclinação simples.
// Recorte/rotação fina são pré-visualizados ao vivo e "aplicados" de forma
// destrutiva em resolução total.

import { useEffect, useState } from "react";
import { Check, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import {
  NEUTRAL_GEOM,
  bakeGeometry,
  cropCanvas,
  extendCanvas,
  perspectiveCanvas,
  resizeCanvas,
  rotate90,
} from "@/lib/photo-engine";
import { usePhotoEditorStore } from "@/store/photo-editor";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RATIOS: { label: string; value: number | null }[] = [
  { label: "Livre", value: null },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "3:2", value: 3 / 2 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

export function RecortarPanel() {
  const { imgW, imgH, params, cropDraft, cropRatio } = usePhotoEditorStore();
  const setGeom = usePhotoEditorStore((s) => s.setGeom);
  const setCropDraft = usePhotoEditorStore((s) => s.setCropDraft);
  const setCropRatio = usePhotoEditorStore((s) => s.setCropRatio);
  const applyPixelOp = usePhotoEditorStore((s) => s.applyPixelOp);
  const requestFit = usePhotoEditorStore((s) => s.requestFit);
  const setBusy = usePhotoEditorStore((s) => s.setBusy);

  const [rw, setRw] = useState(imgW);
  const [rh, setRh] = useState(imgH);
  const [lockAspect, setLockAspect] = useState(true);
  const [pad, setPad] = useState(80);
  const [padColor, setPadColor] = useState("#0a0a0f");
  const [perspH, setPerspH] = useState(0);
  const [perspV, setPerspV] = useState(0);

  // Default crop rect covers the whole image — on tab entry and again after
  // any destructive op (applyPixelOp/undo clear the draft).
  useEffect(() => {
    if (!cropDraft) setCropDraft({ x: 0, y: 0, w: 1, h: 1 });
  }, [cropDraft, setCropDraft]);

  // Keep resize inputs in sync after destructive ops change dimensions.
  useEffect(() => {
    setRw(imgW);
    setRh(imgH);
  }, [imgW, imgH]);

  function pickRatio(value: number | null) {
    setCropRatio(value);
    if (value && imgW > 0 && imgH > 0) {
      // Recenter the draft to the chosen ratio at maximum size.
      const imgRatio = imgW / imgH;
      let w = 1;
      let h = (imgRatio / value);
      if (h > 1) {
        w = 1 / h;
        h = 1;
      }
      setCropDraft({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
    }
  }

  function applyCrop() {
    const draft = cropDraft;
    if (!draft) return;
    const geom = params.geom;
    setBusy("Aplicando recorte…");
    // setTimeout lets the busy overlay paint before the full-res work runs.
    setTimeout(() => {
      applyPixelOp(
        (base) => {
          const baked = bakeGeometry(base, geom); // fine angle + flips → pixels
          return cropCanvas(baked, draft.x * baked.width, draft.y * baked.height, draft.w * baked.width, draft.h * baked.height);
        },
        { geom: { ...NEUTRAL_GEOM } },
      );
      setBusy(null);
      requestFit();
      toast("Recorte aplicado", { variant: "success" });
    }, 30);
  }

  function applyResize() {
    if (rw < 8 || rh < 8 || rw > 12000 || rh > 12000) {
      toast("Dimensões inválidas", { description: "Use valores entre 8 e 12000 pixels.", variant: "error" });
      return;
    }
    setBusy("Redimensionando…");
    setTimeout(() => {
      applyPixelOp((base) => resizeCanvas(base, rw, rh));
      setBusy(null);
      requestFit();
      toast(`Imagem redimensionada para ${rw}×${rh}`, { variant: "success" });
    }, 30);
  }

  function applyExtend() {
    const p = Math.max(0, Math.min(2000, Math.round(pad)));
    if (p === 0) return;
    setBusy("Estendendo bordas…");
    setTimeout(() => {
      applyPixelOp((base) => extendCanvas(base, { top: p, right: p, bottom: p, left: p }, padColor));
      setBusy(null);
      requestFit();
      toast("Bordas estendidas", { variant: "success" });
    }, 30);
  }

  function applyPerspective() {
    if (perspH === 0 && perspV === 0) return;
    const hv = perspH;
    const vv = perspV;
    setBusy("Aplicando perspectiva…");
    setTimeout(() => {
      applyPixelOp((base) => perspectiveCanvas(base, hv, vv));
      setPerspH(0);
      setPerspV(0);
      setBusy(null);
      toast("Perspectiva aplicada", { variant: "success" });
    }, 30);
  }

  return (
    <div className="space-y-5">
      {/* Crop */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recorte</h3>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Proporção do recorte">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              onClick={() => pickRatio(r.value)}
              aria-pressed={cropRatio === r.value}
              className={cn(
                "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                cropRatio === r.value ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">Arraste a moldura sobre a foto para definir a área.</p>
        <Button size="sm" className="w-full" onClick={applyCrop} disabled={!cropDraft}>
          <Check className="h-4 w-4" aria-hidden /> Aplicar recorte
        </Button>
      </section>

      {/* Rotate / flip */}
      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Girar &amp; endireitar</h3>
        <Slider
          label="Ângulo fino (endireitar)"
          min={-45}
          max={45}
          value={Math.round(params.geom.angle)}
          onChange={(v) => setGeom({ angle: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => { applyPixelOp((b) => rotate90(b, -1)); requestFit(); }}>
            <RotateCcw className="h-4 w-4" aria-hidden /> 90° esq.
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { applyPixelOp((b) => rotate90(b, 1)); requestFit(); }}>
            <RotateCw className="h-4 w-4" aria-hidden /> 90° dir.
          </Button>
          <Button
            size="sm"
            variant={params.geom.flipH ? "primary" : "secondary"}
            aria-pressed={params.geom.flipH}
            onClick={() => setGeom({ flipH: !params.geom.flipH })}
          >
            <FlipHorizontal2 className="h-4 w-4" aria-hidden /> Espelhar H
          </Button>
          <Button
            size="sm"
            variant={params.geom.flipV ? "primary" : "secondary"}
            aria-pressed={params.geom.flipV}
            onClick={() => setGeom({ flipV: !params.geom.flipV })}
          >
            <FlipVertical2 className="h-4 w-4" aria-hidden /> Espelhar V
          </Button>
        </div>
        <p className="text-[11px] text-zinc-500">
          O ângulo fino dá zoom para preencher (sem cantos vazios) e é gravado nos pixels ao aplicar o recorte ou exportar.
        </p>
      </section>

      {/* Resize */}
      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Redimensionar</h3>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Largura (px)"
            type="number"
            min={8}
            max={12000}
            value={rw}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value) || 0);
              setRw(v);
              if (lockAspect && imgW > 0) setRh(Math.max(1, Math.round((v * imgH) / imgW)));
            }}
          />
          <Input
            label="Altura (px)"
            type="number"
            min={8}
            max={12000}
            value={rh}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value) || 0);
              setRh(v);
              if (lockAspect && imgH > 0) setRw(Math.max(1, Math.round((v * imgW) / imgH)));
            }}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={lockAspect}
            onChange={(e) => setLockAspect(e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          Manter proporção
        </label>
        <Button size="sm" variant="secondary" className="w-full" onClick={applyResize} disabled={rw === imgW && rh === imgH}>
          Aplicar redimensionamento
        </Button>
      </section>

      {/* Extend */}
      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estender bordas</h3>
        <div className="flex items-end gap-2">
          <Input
            label="Pixels por lado"
            type="number"
            min={0}
            max={2000}
            value={pad}
            onChange={(e) => setPad(Math.round(Number(e.target.value) || 0))}
          />
          <label className="shrink-0 text-xs text-zinc-400">
            Cor
            <input
              type="color"
              value={padColor}
              onChange={(e) => setPadColor(e.target.value)}
              aria-label="Cor do fundo estendido"
              className="mt-1 block h-10 w-14 cursor-pointer rounded-xl border border-line bg-surface-2"
            />
          </label>
        </div>
        <Button size="sm" variant="secondary" className="w-full" onClick={applyExtend} disabled={pad <= 0}>
          Estender tela
        </Button>
      </section>

      {/* Perspective */}
      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Perspectiva / inclinação</h3>
        <Slider label="Vertical (afunilar topo/base)" min={-50} max={50} value={perspH} onChange={setPerspH} />
        <Slider label="Horizontal (afunilar lados)" min={-50} max={50} value={perspV} onChange={setPerspV} />
        <Button size="sm" variant="secondary" className="w-full" onClick={applyPerspective} disabled={perspH === 0 && perspV === 0}>
          Aplicar perspectiva
        </Button>
      </section>
    </div>
  );
}
