"use client";

// FUNDO (IA) — o "Backdrop" do Facetune Pro: recorta a pessoa com a IA
// (RMBG no aparelho) e troca o fundo por transparente, cor sólida, o próprio
// fundo desfocado (bokeh real) ou uma imagem enviada.

import { useRef, useState } from "react";
import { Aperture, Droplet, Eraser, Image as ImageIcon } from "lucide-react";
import { toast } from "@/store/toast";
import { getBaseCanvas, usePhotoEditorStore } from "@/store/photo-editor";
import { Button } from "@/components/ui/button";
import { removeBackground } from "@/lib/ai/background-removal";
import { composeBackdrop } from "@/lib/photo-engine";

export function FundoPanel() {
  const hasImage = usePhotoEditorStore((s) => s.hasImage);
  const busy = usePhotoEditorStore((s) => s.busy);
  const setBusy = usePhotoEditorStore((s) => s.setBusy);
  const applyPixelOp = usePhotoEditorStore((s) => s.applyPixelOp);
  const clearMask = usePhotoEditorStore((s) => s.clearMask);
  const [color, setColor] = useState("#8b5cf6");
  const fileRef = useRef<HTMLInputElement>(null);

  /** Recorta a pessoa com a IA e aplica a composição pedida. */
  async function withCutout(compose: (cutout: HTMLCanvasElement, base: HTMLCanvasElement) => HTMLCanvasElement) {
    if (busy) return;
    const base = getBaseCanvas();
    if (!base) return;
    setBusy("Preparando a IA…");
    try {
      const cutout = await removeBackground(base, (p) => setBusy(p.message));
      applyPixelOp(() => compose(cutout, base));
      clearMask();
    } catch {
      toast("Não foi possível processar o fundo", {
        description: "A IA (~44 MB na 1ª vez) precisa de internet estável. Tente de novo.",
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  function onImageFile(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) toast("Escolha um arquivo de imagem", { variant: "error" });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      void withCutout((cutout) => composeBackdrop(cutout, { kind: "image", image: img })).finally(() => URL.revokeObjectURL(url));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast("Não foi possível abrir a imagem", { variant: "error" });
    };
    img.src = url;
  }

  const disabled = !hasImage || !!busy;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fundo (IA)</h3>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        A IA recorta a pessoa no seu aparelho (baixa ~44 MB na 1ª vez, fica em cache) e você escolhe o fundo novo — o
        &ldquo;Backdrop&rdquo; do Facetune Pro.
      </p>

      <div className="space-y-2">
        <Button size="sm" variant="secondary" className="w-full justify-start" disabled={disabled} onClick={() => void withCutout((c) => c)}>
          <Eraser className="h-3.5 w-3.5" aria-hidden /> Transparente (exportar em PNG)
        </Button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="min-w-0 flex-1 justify-start"
            disabled={disabled}
            onClick={() => void withCutout((c) => composeBackdrop(c, { kind: "color", color }))}
          >
            <Droplet className="h-3.5 w-3.5" aria-hidden /> Cor sólida
          </Button>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Cor do novo fundo"
            className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent"
          />
        </div>

        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-start"
          disabled={disabled}
          onClick={() => void withCutout((c, base) => composeBackdrop(c, { kind: "blur", original: base }))}
        >
          <Aperture className="h-3.5 w-3.5" aria-hidden /> Desfocar o fundo (retrato real)
        </Button>

        <Button size="sm" variant="secondary" className="w-full justify-start" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Trocar por uma imagem…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Imagem do novo fundo"
          onChange={(e) => {
            onImageFile(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-600">
        Funciona melhor com uma pessoa/objeto em destaque. Dá para desfazer (Ctrl+Z) e combinar com Luz, Retoque e
        Filtros depois da troca.
      </p>
    </div>
  );
}
