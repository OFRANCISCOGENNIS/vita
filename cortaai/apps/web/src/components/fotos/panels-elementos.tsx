"use client";

// Texto & Elementos + Camadas tabs. Text layers reuse the Estúdio de Capa
// viral text styles; stickers/emoji, formas (retângulo/círculo/seta) and the
// watermark from the Kit de marca. Camadas: reorder, opacity, visibility,
// flatten into the base pixels.

import Link from "next/link";
import { ArrowDown, ArrowUp, Circle, Eye, EyeOff, Layers as LayersIcon, MoveRight, Plus, Square, Trash2, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { CAPA_TEXT_STYLES, type CapaTextStyle } from "@/lib/capa";
import type { ElementLayer, ShapeKind, TextLayer } from "@/lib/photo-engine";
import { usePhotoEditorStore } from "@/store/photo-editor";
import { useAuthStore } from "@/store/auth";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMOJIS = ["🔥", "😱", "💰", "🚀", "✅", "❌", "👀", "💡", "⚡", "🤯", "📈", "🎯", "❤️", "😂", "⭐", "🏆"];

let idc = 0;
const uid = () => `f${Date.now().toString(36)}${idc++}`;

function layerName(l: ElementLayer): string {
  if (l.kind === "texto") return l.text ? `Texto: ${l.text}` : "Texto (vazio)";
  if (l.kind === "emoji") return `Sticker ${l.emoji}`;
  if (l.kind === "forma") return l.shape === "retangulo" ? "Retângulo" : l.shape === "circulo" ? "Círculo" : "Seta";
  return "Marca d'água";
}

export function TextoPanel() {
  const layers = usePhotoEditorStore((s) => s.params.layers);
  const selectedLayerId = usePhotoEditorStore((s) => s.selectedLayerId);
  const addLayer = usePhotoEditorStore((s) => s.addLayer);
  const updateLayer = usePhotoEditorStore((s) => s.updateLayer);
  const selectLayer = usePhotoEditorStore((s) => s.selectLayer);
  const user = useAuthStore((s) => s.user);

  const selected = layers.find((l) => l.id === selectedLayerId) ?? null;
  const logo = user?.brandingKit.logoUrl ?? null;
  const hasWatermark = layers.some((l) => l.kind === "marca");

  function addText() {
    addLayer({
      kind: "texto", id: uid(), text: "SEU TEXTO", x: 0.5, y: 0.18, size: 0.08,
      style: "impacto", color: "#ffffff", accent: "#000000", opacity: 1, visible: true,
    });
  }
  function addEmoji(emoji: string) {
    addLayer({ kind: "emoji", id: uid(), emoji, x: 0.5, y: 0.5, size: 0.14, opacity: 1, visible: true });
  }
  function addShape(shape: ShapeKind) {
    addLayer({
      kind: "forma", id: uid(), shape, x: 0.5, y: 0.5, w: 0.3, h: shape === "seta" ? 0.08 : 0.22,
      color: "#facc15", fill: shape !== "retangulo", strokeWidth: 0.008, opacity: 1, visible: true,
    });
  }
  function addWatermark() {
    if (!logo) return;
    addLayer({ kind: "marca", id: uid(), dataUrl: logo, x: 0.86, y: 0.92, size: 0.18, opacity: 0.85, visible: true });
    toast("Marca d'água adicionada", { description: "Logo do seu Kit de marca.", variant: "info" });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Texto</h3>
        <Button size="sm" variant="secondary" className="w-full" onClick={addText}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar texto viral
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stickers / emojis</h3>
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => addEmoji(e)}
              aria-label={`Adicionar sticker ${e}`}
              className="rounded-lg border border-line px-2 py-1 text-lg hover:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Formas</h3>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={() => addShape("retangulo")} aria-label="Adicionar retângulo">
            <Square className="h-4 w-4" aria-hidden /> Ret.
          </Button>
          <Button size="sm" variant="outline" onClick={() => addShape("circulo")} aria-label="Adicionar círculo">
            <Circle className="h-4 w-4" aria-hidden /> Círc.
          </Button>
          <Button size="sm" variant="outline" onClick={() => addShape("seta")} aria-label="Adicionar seta">
            <MoveRight className="h-4 w-4" aria-hidden /> Seta
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Marca d&apos;água</h3>
        {logo ? (
          <Button size="sm" variant="secondary" className="w-full" onClick={addWatermark} disabled={hasWatermark}>
            {hasWatermark ? "Marca d'água já adicionada" : "Adicionar logo do Kit de marca"}
          </Button>
        ) : (
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Nenhum logo no seu kit.{" "}
            <Link href="/app/marca" className="text-violet-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              Configure o Kit de marca
            </Link>{" "}
            para usar sua marca d&apos;água aqui.
          </p>
        )}
      </section>

      {/* Selected element editor */}
      {selected && (
        <section className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-violet-400/90">
              {layerName(selected)}
            </h3>
            <button
              onClick={() => selectLayer(null)}
              className="text-[11px] text-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              fechar
            </button>
          </div>

          {selected.kind === "texto" && (
            <>
              <Input label="Conteúdo" value={selected.text} onChange={(e) => updateLayer(selected.id, { text: e.target.value } as Partial<TextLayer>)} />
              <div>
                <p className="mb-1.5 text-xs text-zinc-400">Estilo viral (do Estúdio de Capa)</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estilo do texto">
                  {CAPA_TEXT_STYLES.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => updateLayer(selected.id, { style: st.id as CapaTextStyle } as Partial<TextLayer>)}
                      aria-pressed={selected.style === st.id}
                      className={cn(
                        "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                        selected.style === st.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                      )}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
              <Slider label="Tamanho" min={3} max={22} value={Math.round(selected.size * 100)} onChange={(v) => updateLayer(selected.id, { size: v / 100 })} />
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-zinc-400">
                  Cor
                  <input type="color" value={selected.color} onChange={(e) => updateLayer(selected.id, { color: e.target.value } as Partial<TextLayer>)} aria-label="Cor do texto" className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-line bg-surface-2" />
                </label>
                <label className="text-xs text-zinc-400">
                  Contorno/Destaque
                  <input type="color" value={selected.accent} onChange={(e) => updateLayer(selected.id, { accent: e.target.value } as Partial<TextLayer>)} aria-label="Cor do contorno ou destaque" className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-line bg-surface-2" />
                </label>
              </div>
            </>
          )}

          {selected.kind === "emoji" && (
            <Slider label="Tamanho" min={4} max={40} value={Math.round(selected.size * 100)} onChange={(v) => updateLayer(selected.id, { size: v / 100 })} />
          )}

          {selected.kind === "forma" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-zinc-400">
                  Cor
                  <input type="color" value={selected.color} onChange={(e) => updateLayer(selected.id, { color: e.target.value })} aria-label="Cor da forma" className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-line bg-surface-2" />
                </label>
                <label className="flex items-end gap-2 pb-1 text-xs text-zinc-400">
                  <input type="checkbox" checked={selected.fill} onChange={(e) => updateLayer(selected.id, { fill: e.target.checked })} className="h-3.5 w-3.5 accent-violet-500" />
                  Preenchida
                </label>
              </div>
              <Slider label="Largura" min={4} max={100} value={Math.round(selected.w * 100)} onChange={(v) => updateLayer(selected.id, { w: v / 100 })} />
              <Slider label="Altura" min={2} max={100} value={Math.round(selected.h * 100)} onChange={(v) => updateLayer(selected.id, { h: v / 100 })} />
              {!selected.fill && (
                <Slider label="Espessura do traço" min={2} max={30} value={Math.round(selected.strokeWidth * 1000)} onChange={(v) => updateLayer(selected.id, { strokeWidth: v / 1000 })} />
              )}
            </>
          )}

          {selected.kind === "marca" && (
            <Slider label="Tamanho" min={5} max={60} value={Math.round(selected.size * 100)} onChange={(v) => updateLayer(selected.id, { size: v / 100 })} />
          )}

          <Slider label="Opacidade" min={5} max={100} value={Math.round(selected.opacity * 100)} onChange={(v) => updateLayer(selected.id, { opacity: v / 100 })} />
          <p className="text-[11px] text-zinc-500">Arraste o elemento diretamente sobre a foto para posicionar (ou use as setas com o elemento focado).</p>
        </section>
      )}

      {layers.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-zinc-500">
          Nenhum elemento ainda. Adicione texto, stickers ou formas acima.
        </p>
      )}
    </div>
  );
}

export function CamadasPanel() {
  const layers = usePhotoEditorStore((s) => s.params.layers);
  const selectedLayerId = usePhotoEditorStore((s) => s.selectedLayerId);
  const selectLayer = usePhotoEditorStore((s) => s.selectLayer);
  const updateLayer = usePhotoEditorStore((s) => s.updateLayer);
  const removeLayer = usePhotoEditorStore((s) => s.removeLayer);
  const moveLayer = usePhotoEditorStore((s) => s.moveLayer);
  const flattenLayers = usePhotoEditorStore((s) => s.flattenLayers);

  // Painted last = on top: show top-most first in the list.
  const ordered = [...layers].reverse();

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Camadas</h3>

      <ul className="space-y-1.5" aria-label="Lista de camadas (de cima para baixo)">
        {ordered.map((l) => (
          <li
            key={l.id}
            className={cn(
              "rounded-xl border px-2 py-2",
              selectedLayerId === l.id ? "border-cyan-400/50 bg-cyan-500/5" : "border-line",
            )}
          >
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateLayer(l.id, { visible: !l.visible })}
                aria-label={l.visible ? `Ocultar ${layerName(l)}` : `Mostrar ${layerName(l)}`}
                aria-pressed={l.visible}
                className="rounded p-1 text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-zinc-600" />}
              </button>
              <button
                onClick={() => selectLayer(selectedLayerId === l.id ? null : l.id)}
                className="flex-1 truncate text-left text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                aria-pressed={selectedLayerId === l.id}
              >
                {layerName(l)}
              </button>
              <button onClick={() => moveLayer(l.id, 1)} aria-label={`Subir ${layerName(l)}`} className="rounded p-1 text-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => moveLayer(l.id, -1)} aria-label={`Descer ${layerName(l)}`} className="rounded p-1 text-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => removeLayer(l.id)} aria-label={`Remover ${layerName(l)}`} className="rounded p-1 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {selectedLayerId === l.id && (
              <div className="mt-2">
                <Slider label="Opacidade" min={5} max={100} value={Math.round(l.opacity * 100)} onChange={(v) => updateLayer(l.id, { opacity: v / 100 })} />
              </div>
            )}
          </li>
        ))}
        <li className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-2 py-2">
          <LayersIcon className="h-3.5 w-3.5 text-violet-400" aria-hidden />
          <span className="flex-1 text-xs font-medium text-zinc-300">Imagem base (pixels)</span>
          <span className="text-[10px] text-zinc-600">fixa</span>
        </li>
      </ul>

      {layers.length > 0 ? (
        <div className="space-y-2 border-t border-line pt-3">
          <Button size="sm" variant="secondary" className="w-full" onClick={() => { flattenLayers(); toast("Camadas mescladas na imagem", { variant: "success" }); }}>
            Mesclar tudo na imagem
          </Button>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Grava os elementos nos pixels da imagem base — depois disso eles também recebem os ajustes de cor. Dá para desfazer (Ctrl+Z).
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-zinc-500">
          Sem camadas de elementos. Adicione na aba Texto &amp; Elementos.
        </p>
      )}
    </div>
  );
}
