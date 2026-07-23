"use client";

// Editor de Fotos — Photoshop/Facetune-style photo editor, 100% client-side
// (static-export safe). Shell: upload/empty/error states, left tool tabs,
// central canvas stage, right context panel, undo/redo, antes/depois hold,
// export PNG/JPEG and the light handoff to/from the Estúdio de Capa.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Brush, Crop, Download, Eye, ImageMinus, ImagePlus, ImageUp, Layers, Loader2,
  Palette, Redo2, Smile, Sparkles, SlidersHorizontal, Sun, Type, Undo2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { makeSampleImage, renderPhoto, downscaleToMax, makeCanvas } from "@/lib/photo-engine";
import {
  HANDOFF_TO_CAPA,
  HANDOFF_TO_FOTOS,
  getBaseCanvas,
  usePhotoEditorStore,
  type FotosTab,
} from "@/store/photo-editor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Modal } from "@/components/ui/modal";
import { FotoStage } from "./stage";
import { AjustesPanel } from "./panels-ajustes";
import { CurvasPanel } from "./curve-editor";
import { CorHslPanel } from "./panels-cor";
import { RecortarPanel } from "./panels-geometria";
import { RetoquePanel, PinceisPanel } from "./panels-retoque";
import { FiltrosPanel } from "./panels-filtros";
import { TextoPanel, CamadasPanel } from "./panels-elementos";
import { LuzPanel } from "./panels-luz";
import { FundoPanel } from "./panels-fundo";

// Ordem mobile-first: Luz e Retoque logo no início (a fileira rola de lado no
// celular e o que fica depois da dobra é difícil de descobrir).
const TABS: { id: FotosTab; label: string; icon: typeof Brush }[] = [
  { id: "ajustes", label: "Ajustes", icon: SlidersHorizontal },
  { id: "luz", label: "Luz", icon: Sun },
  { id: "retoque", label: "Retoque", icon: Smile },
  { id: "fundo", label: "Fundo (IA)", icon: ImageMinus },
  { id: "filtros", label: "Filtros", icon: Sparkles },
  { id: "recortar", label: "Recortar", icon: Crop },
  { id: "curvas", label: "Curvas", icon: Activity },
  { id: "cor", label: "Cor (HSL)", icon: Palette },
  { id: "pinceis", label: "Pincéis", icon: Brush },
  { id: "texto", label: "Texto & Elementos", icon: Type },
  { id: "camadas", label: "Camadas", icon: Layers },
];

export function FotoEditor() {
  const router = useRouter();
  const s = usePhotoEditorStore();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------- file loading
  const loadFromFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLoadError("Arquivo inválido — envie uma imagem (PNG, JPG, WEBP…).");
      toast("Arquivo inválido", { description: "Envie uma imagem PNG, JPG ou WEBP.", variant: "error" });
      return;
    }
    setLoadError(null);
    setLoading(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      usePhotoEditorStore.getState().loadImage(img);
      URL.revokeObjectURL(url);
      setLoading(false);
      toast("Imagem carregada", { description: `${img.naturalWidth}×${img.naturalHeight} px`, variant: "success" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setLoading(false);
      setLoadError("Não foi possível decodificar a imagem. Tente outro arquivo.");
      toast("Falha ao carregar a imagem", { variant: "error" });
    };
    img.src = url;
  }, []);

  function loadSample() {
    setLoadError(null);
    usePhotoEditorStore.getState().loadImage(makeSampleImage());
    toast("Imagem de exemplo carregada", { description: "Cena gerada localmente — explore as ferramentas.", variant: "info" });
  }

  // Handoff from the Estúdio de Capa ("Abrir no Editor de Fotos").
  useEffect(() => {
    try {
      const data = sessionStorage.getItem(HANDOFF_TO_FOTOS);
      if (!data) return;
      sessionStorage.removeItem(HANDOFF_TO_FOTOS);
      setLoading(true);
      const img = new Image();
      img.onload = () => {
        usePhotoEditorStore.getState().loadImage(img);
        setLoading(false);
        toast("Imagem recebida do Estúdio de Capa", { variant: "info" });
      };
      img.onerror = () => setLoading(false);
      img.src = data;
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, []);

  // ------------------------------------------------------- keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const st = usePhotoEditorStore.getState();
      if (!st.hasImage) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if (e.key === "[") {
        st.setBrushSize(st.brushSize - 6);
      } else if (e.key === "]") {
        st.setBrushSize(st.brushSize + 6);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------------- export
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(90);
  const [jpegBg, setJpegBg] = useState("#ffffff");
  const [exporting, setExporting] = useState(false);

  /**
   * Full-resolution render. The whole pipeline runs once on the full base
   * (potentially 12MP — hundreds of ms), so it happens behind the busy state,
   * deferred with setTimeout so the overlay paints first.
   */
  const renderFull = useCallback((): HTMLCanvasElement | null => {
    const base = getBaseCanvas();
    if (!base) return null;
    const dest = makeCanvas(base.width, base.height);
    renderPhoto(base, usePhotoEditorStore.getState().params, dest);
    return dest;
  }, []);

  function doExport() {
    setExporting(true);
    setTimeout(() => {
      try {
        let out = renderFull();
        if (!out) throw new Error("no image");
        if (format === "jpeg") {
          // JPEG has no alpha — flatten over the chosen background.
          const flat = makeCanvas(out.width, out.height);
          const ctx = flat.getContext("2d")!;
          ctx.fillStyle = jpegBg;
          ctx.fillRect(0, 0, flat.width, flat.height);
          ctx.drawImage(out, 0, 0);
          out = flat;
        }
        out.toBlob(
          (blob) => {
            setExporting(false);
            if (!blob) {
              toast("Falha ao exportar a imagem", { variant: "error" });
              return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `foto-cortaai-${Date.now().toString(36)}.${format === "png" ? "png" : "jpg"}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setExportOpen(false);
            toast(`Foto exportada em ${format.toUpperCase()}`, { variant: "success" });
          },
          format === "png" ? "image/png" : "image/jpeg",
          quality / 100,
        );
      } catch {
        setExporting(false);
        toast("Falha ao exportar a imagem", { variant: "error" });
      }
    }, 40);
  }

  function exportToCapa() {
    setExporting(true);
    setTimeout(() => {
      try {
        const full = renderFull();
        if (!full) throw new Error("no image");
        // ≤2MP JPEG keeps the dataURL well under the sessionStorage quota.
        const small = downscaleToMax(full, 2_000_000);
        const flat = makeCanvas(small.width, small.height);
        const ctx = flat.getContext("2d")!;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, flat.width, flat.height);
        ctx.drawImage(small, 0, 0);
        sessionStorage.setItem(HANDOFF_TO_CAPA, flat.toDataURL("image/jpeg", 0.92));
        setExporting(false);
        setExportOpen(false);
        toast("Imagem enviada para o Estúdio de Capa", { description: "Escolha um corte para montar a capa.", variant: "success" });
        router.push("/app/capa");
      } catch {
        setExporting(false);
        toast("Não foi possível enviar para a capa", { description: "A imagem pode ser grande demais para a transferência.", variant: "error" });
      }
    }, 40);
  }

  // --------------------------------------------------------------- empty view
  if (!s.hasImage) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            <ImagePlus className="mr-2 inline h-6 w-6 text-fuchsia-400" aria-hidden />
            Editor de Fotos
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Edição completa no navegador: ajustes, curvas, HSL, recorte, retoque estilo Facetune,
            pincéis, filtros, texto e camadas — nada sai do seu computador.
          </p>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Solte uma imagem aqui ou clique para selecionar do computador"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
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
            loadFromFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            dragging ? "scale-[1.01] border-violet-400 bg-violet-500/10 shadow-glow" : "border-white/10 bg-white/[0.03] hover:border-violet-500/50 hover:bg-white/[0.05]",
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-violet-400" aria-hidden />
              <p className="text-sm text-zinc-300" role="status">Carregando imagem…</p>
            </>
          ) : (
            <>
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20 ring-1 ring-violet-500/30">
                <ImageUp className="h-8 w-8 text-violet-300" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-white">Arraste uma imagem aqui</p>
              <p className="text-xs text-zinc-500">PNG, JPG ou WEBP — nada sai do seu aparelho</p>
              <Button
                className="mt-2"
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <ImageUp className="h-4 w-4" aria-hidden /> Escolher foto do aparelho
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  loadSample();
                }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Usar imagem de exemplo
              </Button>
            </>
          )}
        </div>
        {loadError && (
          <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {loadError}
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Selecionar arquivo de imagem"
          onChange={(e) => {
            loadFromFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // -------------------------------------------------------------- editor view
  return (
    <div className="relative mx-auto flex max-w-[1500px] flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full min-w-0 lg:w-auto lg:flex-1">
          <h1 className="truncate text-lg font-bold text-white">
            <ImagePlus className="mr-2 inline h-5 w-5 text-fuchsia-400" aria-hidden />
            Editor de Fotos
          </h1>
          <p className="truncate text-xs text-zinc-500">{s.imgW}×{s.imgH} px · edição 100% local</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} title="Anexar outra foto do aparelho">
          <ImageUp className="h-4 w-4" aria-hidden /> Trocar foto
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Selecionar arquivo de imagem"
          onChange={(e) => {
            loadFromFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-surface-1/60 p-1 backdrop-blur-xl" role="group" aria-label="Histórico">
          <button
            onClick={s.undo}
            disabled={s.pastCount === 0}
            aria-label={`Desfazer (${s.pastCount} passos disponíveis)`}
            title="Desfazer (Ctrl+Z)"
            className="rounded-lg p-2 text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={s.redo}
            disabled={s.futureCount === 0}
            aria-label={`Refazer (${s.futureCount} passos disponíveis)`}
            title="Refazer (Ctrl+Shift+Z)"
            className="rounded-lg p-2 text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
        <button
          onPointerDown={() => s.setComparing(true)}
          onPointerUp={() => s.setComparing(false)}
          onPointerLeave={() => s.setComparing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              s.setComparing(true);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter" || e.key === " ") s.setComparing(false);
          }}
          onBlur={() => s.setComparing(false)}
          aria-pressed={s.comparing}
          title="Segure para comparar com o original"
          className={cn(
            "inline-flex h-9 select-none items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            s.comparing ? "bg-amber-500/20 text-amber-300" : "bg-surface-1 text-zinc-300 hover:text-white",
          )}
        >
          <Eye className="h-4 w-4" aria-hidden /> Antes/Depois
        </button>
        <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Fechar esta imagem? Edições não exportadas serão perdidas.")) s.closeImage(); }} aria-label="Fechar imagem atual">
          <X className="h-4 w-4" aria-hidden /> Fechar
        </Button>
        <Button onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4" aria-hidden /> Exportar
        </Button>
      </div>

      {/* Body: tool rail + stage + context panel */}
      <div className="grid gap-3 lg:h-[calc(100vh-13.5rem)] lg:min-h-[520px] lg:grid-cols-[190px_minmax(0,1fr)_330px]">
        {/* Tool tabs */}
        <nav
          aria-label="Ferramentas do editor de fotos"
          className="editor-scroll flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface-1/60 p-2 backdrop-blur-xl lg:flex-col lg:overflow-y-auto"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = s.activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => s.setActiveTab(t.id)}
                aria-pressed={active}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  active
                    ? "bg-gradient-to-r from-violet-600/25 to-fuchsia-600/15 text-white shadow-[0_0_20px_-6px_rgba(139,92,246,0.5)] ring-1 ring-inset ring-violet-500/30"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Stage */}
        <div className="flex min-h-[380px] flex-col lg:min-h-0">
          <FotoStage />
        </div>

        {/* Context panel */}
        <aside
          aria-label="Painel de opções da ferramenta"
          className="editor-scroll max-h-[60vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-surface-1/60 p-4 backdrop-blur-xl lg:max-h-none"
        >
          <div key={s.activeTab} className="panel-fade">
          {s.activeTab === "ajustes" && <AjustesPanel />}
          {s.activeTab === "curvas" && <CurvasPanel />}
          {s.activeTab === "cor" && <CorHslPanel />}
          {s.activeTab === "recortar" && <RecortarPanel />}
          {s.activeTab === "retoque" && <RetoquePanel />}
          {s.activeTab === "fundo" && <FundoPanel />}
          {s.activeTab === "pinceis" && <PinceisPanel />}
          {s.activeTab === "filtros" && <FiltrosPanel />}
          {s.activeTab === "luz" && <LuzPanel />}
          {s.activeTab === "texto" && <TextoPanel />}
          {s.activeTab === "camadas" && <CamadasPanel />}
          </div>
        </aside>
      </div>

      {/* Busy overlay (full-res operations) */}
      {(s.busy || exporting) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 px-5 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" aria-hidden />
            <span className="text-sm text-zinc-200">{s.busy ?? "Exportando em resolução total…"}</span>
          </div>
        </div>
      )}

      {/* Export modal */}
      <Modal
        open={exportOpen}
        onClose={() => !exporting && setExportOpen(false)}
        title="Exportar foto"
        description={`A imagem será renderizada em resolução total (${s.imgW}×${s.imgH} px).`}
      >
        <div className="space-y-4">
          <div role="group" aria-label="Formato de exportação" className="grid grid-cols-2 gap-2">
            {(["png", "jpeg"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  format === f ? "border-violet-500/60 bg-violet-500/10" : "border-line hover:border-zinc-500",
                )}
              >
                <span className="block text-sm font-semibold text-white">{f.toUpperCase()}</span>
                <span className="block text-[11px] text-zinc-500">
                  {f === "png" ? "Sem perdas, mantém transparência" : "Arquivo menor, com qualidade ajustável"}
                </span>
              </button>
            ))}
          </div>

          {format === "jpeg" && (
            <>
              <Slider label="Qualidade JPEG" min={40} max={100} value={quality} onChange={setQuality} />
              <label className="flex items-center gap-3 text-xs text-zinc-400">
                Fundo (áreas transparentes)
                <input
                  type="color"
                  value={jpegBg}
                  onChange={(e) => setJpegBg(e.target.value)}
                  aria-label="Cor de fundo para áreas transparentes no JPEG"
                  className="h-9 w-14 cursor-pointer rounded-lg border border-line bg-surface-2"
                />
              </label>
            </>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={doExport} loading={exporting} className="w-full">
              <Download className="h-4 w-4" aria-hidden /> Baixar {format.toUpperCase()}
            </Button>
            <Button variant="secondary" onClick={exportToCapa} disabled={exporting} className="w-full">
              <ImagePlus className="h-4 w-4" aria-hidden /> Exportar para o Estúdio de Capa
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
