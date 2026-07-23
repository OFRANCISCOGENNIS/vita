"use client";

// Estúdio de Capa — canvas-based cover/thumbnail editor for a cut. Crop to
// platform ratios, add viral-style text + stickers, color adjustments,
// background removal (chroma) + sharpen, export as PNG, and an A/B comparator.
// Fully client-side and export-safe (no external assets, no backend).

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ImagePlus,
  ImageUp,
  Plus,
  RotateCcw,
  Trash2,
  Type,
} from "lucide-react";
import * as api from "@/lib/api";
import type { Cut } from "@/lib/types";
import {
  CAPA_RATIOS,
  CAPA_TEXT_STYLES,
  defaultCapaState,
  renderCapa,
  type CapaRatio,
  type CapaState,
  type CapaText,
  type CapaTextStyle,
} from "@/lib/capa";
import { downscaleToMax } from "@/lib/photo-engine";
import { HANDOFF_TO_CAPA, HANDOFF_TO_FOTOS } from "@/store/photo-editor";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const EMOJIS = ["🔥", "😱", "💰", "🚀", "✅", "❌", "👀", "💡", "⚡", "🤯", "📈", "🎯"];
const PREVIEW_MAX = 440;

let idc = 0;
const uid = () => `c${Date.now().toString(36)}${idc++}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface Slot {
  dataUrl: string;
  label: string;
}

export function CapaStudio({ cutId }: { cutId: string }) {
  const router = useRouter();
  const [cut, setCut] = useState<Cut | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [state, setState] = useState<CapaState>(defaultCapaState());
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [slotA, setSlotA] = useState<Slot | null>(null);
  const [slotB, setSlotB] = useState<Slot | null>(null);
  const [chosen, setChosen] = useState<"A" | "B" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const ratio = CAPA_RATIOS.find((r) => r.id === state.ratio) ?? CAPA_RATIOS[0];
  const previewH = ratio.h >= ratio.w ? PREVIEW_MAX : Math.round((PREVIEW_MAX * ratio.h) / ratio.w);
  const previewW = Math.round((previewH * ratio.w) / ratio.h);

  useEffect(() => {
    let alive = true;
    api
      .getCut(cutId)
      .then((c) => {
        if (!alive) return;
        setCut(c);
        // Seed the first headline from the cut title.
        setState((s) => ({
          ...s,
          texts: [
            {
              id: uid(),
              text: c.title.length > 42 ? c.title.slice(0, 42) : c.title,
              x: 0.5,
              y: 0.16,
              size: 0.075,
              style: "impacto",
              color: "#ffffff",
              accent: "#000000",
            },
          ],
        }));
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [cutId]);

  // Handoff from the Editor de Fotos ("Exportar para capa"): use the edited
  // photo as the base image of this cover.
  useEffect(() => {
    try {
      const data = sessionStorage.getItem(HANDOFF_TO_CAPA);
      if (!data) return;
      sessionStorage.removeItem(HANDOFF_TO_CAPA);
      const img = new Image();
      img.onload = () => {
        setBaseImg(img);
        toast("Imagem recebida do Editor de Fotos", { variant: "info" });
      };
      img.src = data;
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, []);

  // Live render whenever the composition changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderCapa(ctx, canvas.width, canvas.height, state, baseImg);
  }, [state, baseImg, previewW, previewH]);

  const patch = useCallback((p: Partial<CapaState>) => setState((s) => ({ ...s, ...p })), []);

  function updateText(id: string, p: Partial<CapaText>) {
    setState((s) => ({ ...s, texts: s.texts.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
  }
  function addText() {
    const t: CapaText = { id: uid(), text: "NOVO TEXTO", x: 0.5, y: 0.5, size: 0.07, style: "impacto", color: "#facc15", accent: "#000000" };
    setState((s) => ({ ...s, texts: [...s.texts, t] }));
    setSelected(t.id);
  }
  function removeText(id: string) {
    setState((s) => ({ ...s, texts: s.texts.filter((t) => t.id !== id) }));
    setSelected((sel) => (sel === id ? null : sel));
  }
  function addSticker(emoji: string) {
    setState((s) => ({ ...s, stickers: [...s.stickers, { id: uid(), emoji, x: 0.5, y: 0.5, size: 0.12 }] }));
  }
  function removeSticker(id: string) {
    setState((s) => ({ ...s, stickers: s.stickers.filter((st) => st.id !== id) }));
  }

  function onUpload(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setBaseImg(img);
      toast("Imagem carregada na capa", { variant: "info" });
    };
    img.onerror = () => toast("Não foi possível carregar a imagem", { variant: "error" });
    img.src = url;
  }

  /** Render to a full-resolution offscreen canvas. */
  function composeFull(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = ratio.w;
    c.height = ratio.h;
    renderCapa(c.getContext("2d")!, ratio.w, ratio.h, state, baseImg);
    return c;
  }

  function exportPng() {
    const c = composeFull();
    c.toBlob((blob) => {
      if (!blob) {
        toast("Falha ao exportar a capa", { variant: "error" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `capa-${cutId.slice(0, 8)}-${state.ratio.replace(":", "x")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Capa exportada como PNG");
    }, "image/png");
  }

  /** Sends the current composition to the Editor de Fotos for pixel-level edits. */
  function openInPhotoEditor() {
    try {
      // ≤2MP JPEG keeps the dataURL comfortably under the sessionStorage quota.
      const small = downscaleToMax(composeFull(), 2_000_000);
      sessionStorage.setItem(HANDOFF_TO_FOTOS, small.toDataURL("image/jpeg", 0.92));
      toast("Capa enviada para o Editor de Fotos", { variant: "info" });
      router.push("/app/fotos");
    } catch {
      toast("Não foi possível abrir no Editor de Fotos", { variant: "error" });
    }
  }

  function saveToSlot(slot: "A" | "B") {
    const c = composeFull();
    const dataUrl = c.toDataURL("image/png");
    const entry: Slot = { dataUrl, label: `${state.ratio} · ${state.texts.length} texto(s)` };
    if (slot === "A") setSlotA(entry);
    else setSlotB(entry);
    toast(`Salvo como opção ${slot}`, { variant: "info" });
  }

  /** Download a saved A/B slot (full-res PNG data URL) as a file. */
  function downloadSlot(slot: "A" | "B", dataUrl: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `capa-${cutId.slice(0, 8)}-opcao-${slot}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`Opção ${slot} baixada como PNG`);
  }

  // Pointer drag for a text/sticker handle (updates normalized position).
  function dragHandle(e: ReactPointerEvent, get: () => { x: number; y: number }, set: (x: number, y: number) => void) {
    e.preventDefault();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const start = get();
    const sx = e.clientX;
    const sy = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    function move(ev: PointerEvent) {
      set(clamp01(start.x + (ev.clientX - sx) / rect.width), clamp01(start.y + (ev.clientY - sy) / rect.height));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function handleKey(e: KeyboardEvent, get: () => { x: number; y: number }, set: (x: number, y: number) => void) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const p = get();
    let handled = true;
    if (e.key === "ArrowLeft") set(clamp01(p.x - step), p.y);
    else if (e.key === "ArrowRight") set(clamp01(p.x + step), p.y);
    else if (e.key === "ArrowUp") set(p.x, clamp01(p.y - step));
    else if (e.key === "ArrowDown") set(p.x, clamp01(p.y + step));
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-zinc-400">Corte não encontrado para gerar a capa.</p>
        <Link href="/app/capa" className="mt-3 inline-flex text-sm text-violet-400 hover:text-violet-300">
          Voltar
        </Link>
      </div>
    );
  }

  if (!cut) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[440px] w-full" />
          <Skeleton className="h-[440px] w-full" />
        </div>
      </div>
    );
  }

  const selText = state.texts.find((t) => t.id === selected) ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/app/editor?cut=${cut.id}`}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Editor
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-white">Estúdio de Capa</h1>
          <p className="truncate text-xs text-zinc-500" title={cut.title}>{cut.title}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openInPhotoEditor} title="Editar os pixels desta capa no Editor de Fotos">
          <ImagePlus className="h-4 w-4" aria-hidden /> Abrir no Editor de Fotos
        </Button>
        <Button onClick={exportPng}>
          <Download className="h-4 w-4" aria-hidden /> Exportar PNG
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Canvas + overlays */}
        <div className="flex flex-col items-center gap-4">
          <div
            role="group"
            aria-label="Proporção da capa"
            className="flex flex-wrap justify-center gap-1 rounded-xl border border-line bg-surface-1 p-1"
          >
            {CAPA_RATIOS.map((r) => (
              <button
                key={r.id}
                onClick={() => patch({ ratio: r.id as CapaRatio })}
                aria-pressed={state.ratio === r.id}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  state.ratio === r.id ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white" : "text-zinc-400 hover:text-white",
                )}
                title={r.label}
              >
                {r.id}
              </button>
            ))}
          </div>

          <div
            ref={wrapRef}
            className="relative overflow-hidden rounded-2xl border border-line bg-black shadow-2xl"
            style={{ width: previewW, height: previewH, maxWidth: "100%" }}
          >
            <canvas ref={canvasRef} width={previewW} height={previewH} className="block h-full w-full" aria-label="Prévia da capa" />

            {/* Draggable text handles */}
            {state.texts.map((t) => (
              <button
                key={t.id}
                onPointerDown={(e) => dragHandle(e, () => ({ x: t.x, y: t.y }), (x, y) => updateText(t.id, { x, y }))}
                onKeyDown={(e) => handleKey(e, () => ({ x: t.x, y: t.y }), (x, y) => updateText(t.id, { x, y }))}
                onFocus={() => setSelected(t.id)}
                onClick={() => setSelected(t.id)}
                aria-label={`Mover texto "${t.text}" — setas para posicionar`}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded border-2 border-dashed px-6 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  selected === t.id ? "border-cyan-400/80" : "border-white/30",
                )}
                style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
              />
            ))}

            {/* Draggable sticker handles */}
            {state.stickers.map((st) => (
              <button
                key={st.id}
                onPointerDown={(e) => dragHandle(e, () => ({ x: st.x, y: st.y }), (x, y) => setState((s) => ({ ...s, stickers: s.stickers.map((k) => (k.id === st.id ? { ...k, x, y } : k)) })))}
                onKeyDown={(e) => handleKey(e, () => ({ x: st.x, y: st.y }), (x, y) => setState((s) => ({ ...s, stickers: s.stickers.map((k) => (k.id === st.id ? { ...k, x, y } : k)) })))}
                aria-label={`Mover sticker ${st.emoji}`}
                className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                style={{ left: `${st.x * 100}%`, top: `${st.y * 100}%` }}
              />
            ))}
          </div>
          <p className="text-xs text-zinc-500">Arraste os textos e stickers sobre a capa. Exportação em {ratio.w}×{ratio.h}.</p>

          {/* A/B comparator */}
          <section className="w-full rounded-2xl border border-line bg-surface-1 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Comparador A/B</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => saveToSlot("A")}>Salvar como A</Button>
                <Button size="sm" variant="secondary" onClick={() => saveToSlot("B")}>Salvar como B</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["A", "B"] as const).map((slot) => {
                const entry = slot === "A" ? slotA : slotB;
                return (
                  <div key={slot} className={cn("rounded-xl border p-2", chosen === slot ? "border-emerald-400/60 bg-emerald-500/5" : "border-line")}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-300">Opção {slot}</span>
                      {chosen === slot && <span className="text-[10px] font-medium text-emerald-400">escolhida ✓</span>}
                    </div>
                    {entry ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.dataUrl} alt={`Opção ${slot}`} className="mb-2 max-h-40 w-full rounded-lg object-contain" />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={chosen === slot ? "primary" : "outline"}
                            className="flex-1"
                            onClick={() => {
                              setChosen(slot);
                              toast(`Opção ${slot} escolhida como capa`);
                            }}
                          >
                            Escolher {slot}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Baixar opção ${slot}`}
                            title="Baixar esta opção"
                            onClick={() => downloadSlot(slot, entry.dataUrl)}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-lg bg-surface-2 text-xs text-zinc-600">
                        Salve a composição atual
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Controls */}
        <aside className="space-y-5">
          {/* Base image */}
          <section className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Imagem base</h2>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-zinc-300 hover:border-violet-500/50 hover:text-white focus-within:ring-2 focus-within:ring-violet-400">
              <ImageUp className="h-4 w-4" aria-hidden />
              {baseImg ? "Trocar imagem" : "Enviar imagem (opcional)"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />
            </label>
            {baseImg && (
              <button onClick={() => setBaseImg(null)} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                <RotateCcw className="h-3 w-3" aria-hidden /> Voltar à cena padrão
              </button>
            )}
          </section>

          {/* Text layers */}
          <section className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Textos</h2>
              <button onClick={addText} className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                <Plus className="h-3 w-3" aria-hidden /> Adicionar
              </button>
            </div>
            <ul className="space-y-1.5">
              {state.texts.map((t) => (
                <li key={t.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                      selected === t.id ? "border-cyan-400/50 bg-cyan-500/5" : "border-line",
                    )}
                  >
                    <button onClick={() => setSelected(selected === t.id ? null : t.id)} className="flex flex-1 items-center gap-1.5 truncate text-left text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" aria-pressed={selected === t.id}>
                      <Type className="h-3 w-3 shrink-0 text-violet-400" aria-hidden />
                      <span className="truncate">{t.text || "(vazio)"}</span>
                    </button>
                    <button onClick={() => removeText(t.id)} aria-label="Remover texto" className="rounded p-0.5 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
              {state.texts.length === 0 && <li className="text-xs text-zinc-500">Nenhum texto ainda.</li>}
            </ul>

            {selText && (
              <div className="space-y-3 border-t border-line pt-3">
                <Input label="Conteúdo" value={selText.text} onChange={(e) => updateText(selText.id, { text: e.target.value })} />
                <div>
                  <p className="mb-1.5 text-xs text-zinc-400">Estilo de texto</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estilo do texto">
                    {CAPA_TEXT_STYLES.map((st) => (
                      <button
                        key={st.id}
                        onClick={() => updateText(selText.id, { style: st.id as CapaTextStyle })}
                        aria-pressed={selText.style === st.id}
                        className={cn(
                          "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                          selText.style === st.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                        )}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Slider label="Tamanho" min={4} max={20} value={Math.round(selText.size * 100)} onChange={(v) => updateText(selText.id, { size: v / 100 })} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-zinc-400">
                    Cor
                    <input type="color" value={selText.color} onChange={(e) => updateText(selText.id, { color: e.target.value })} className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-line bg-surface-2" aria-label="Cor do texto" />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Contorno/Destaque
                    <input type="color" value={selText.accent} onChange={(e) => updateText(selText.id, { accent: e.target.value })} className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-line bg-surface-2" aria-label="Cor de contorno/destaque" />
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* Stickers */}
          <section className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stickers / emojis</h2>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => addSticker(e)} aria-label={`Adicionar ${e}`} className="rounded-lg border border-line px-2 py-1 text-lg hover:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  {e}
                </button>
              ))}
            </div>
            {state.stickers.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {state.stickers.map((st) => (
                  <li key={st.id} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-sm">
                    <span aria-hidden>{st.emoji}</span>
                    <button onClick={() => removeSticker(st.id)} aria-label={`Remover ${st.emoji}`} className="text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Color adjustments */}
          <section className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ajustes de cor</h2>
            <Slider label="Brilho" min={-100} max={100} value={state.brightness} onChange={(v) => patch({ brightness: v })} />
            <Slider label="Contraste" min={-100} max={100} value={state.contrast} onChange={(v) => patch({ contrast: v })} />
            <Slider label="Saturação" min={-100} max={100} value={state.saturation} onChange={(v) => patch({ saturation: v })} />
            <Slider label="Nitidez (sharpen)" min={0} max={100} value={state.sharpen} onChange={(v) => patch({ sharpen: v })} />
          </section>

          {/* Background removal */}
          <section className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
            <Switch checked={state.bgRemoval} onChange={(v) => patch({ bgRemoval: v })} label="Remover fundo por cor" description="Chroma: substitui o fundo por um gradiente" />
            {state.bgRemoval && (
              <>
                <div className="flex items-center gap-2">
                  <input type="color" value={state.bgKeyColor} onChange={(e) => patch({ bgKeyColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface-2" aria-label="Cor do fundo a remover" />
                  <span className="font-mono text-xs text-zinc-500">{state.bgKeyColor}</span>
                </div>
                <Slider label="Tolerância" min={0} max={100} value={state.bgTolerance} onChange={(v) => patch({ bgTolerance: v })} />
                <Slider label="Suavidade" min={0} max={100} value={state.bgSoftness} onChange={(v) => patch({ bgSoftness: v })} />
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
