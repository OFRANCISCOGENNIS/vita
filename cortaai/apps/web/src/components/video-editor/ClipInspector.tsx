"use client";

// Inspector do clipe selecionado (painel PROPRIEDADES estilo Premiere), agora
// organizado em ABAS como a referência: Vídeo (transformar/cor/chroma/máscara/
// mesclagem), Áudio (velocidade/volume/aprimoramento/EQ), Animação (Ken Burns/
// entrada-saída/transição/keyframes) e Ajustes (filtros/efeitos). Cada mudança
// vira uma ação no store (histórico undo/redo).

import { useEffect, useRef, useState } from "react";
import { Copy, Diamond, Film, Music, Repeat, RotateCcw, Snowflake, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANIM_PRESETS } from "@/lib/video-editor/animations";
import { valueAt } from "@/lib/video-editor/engine";
import { CLIP_FILTERS, OVERLAY_EFFECTS } from "@/lib/video-editor/filters";
import { TRANSITIONS } from "@/lib/video-editor/transitions";
import { projectDurationMs } from "@/lib/video-editor/timeline-math";
import { registerFile } from "@/lib/video-editor/media-registry";
import { ensureBgVideoSegmenter, isBgVideoReady } from "@/lib/ai/video-segmenter";
import type { AnimatableProperty, BlendMode, Clip, ClipMask, Keyframe } from "@/lib/video-editor/model";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

const DEFAULT_MASK: ClipMask = { kind: "rect", x: 0.5, y: 0.5, w: 0.6, h: 0.6, feather: 0.1, inverted: false };

const KF_PROPS: { prop: AnimatableProperty; label: string }[] = [
  { prop: "scale", label: "Escala" },
  { prop: "x", label: "X" },
  { prop: "y", label: "Y" },
  { prop: "rotation", label: "Rot" },
  { prop: "opacity", label: "Opac" },
];

const BLEND_MODES: BlendMode[] = ["normal", "multiply", "screen", "overlay", "lighten", "darken", "difference"];

type PropsTab = "video" | "audio" | "anim" | "ajustes";

export function ClipInspector() {
  const project = useVideoEditor((s) => s.project);
  const selectedClipId = useVideoEditor((s) => s.selectedClipId);
  const playheadMs = useVideoEditor((s) => s.playheadMs);
  const updateClip = useVideoEditor((s) => s.updateClip);
  const setClipSpeed = useVideoEditor((s) => s.setClipSpeed);
  const deleteClip = useVideoEditor((s) => s.deleteClip);
  const duplicateClip = useVideoEditor((s) => s.duplicateClip);
  const detachAudio = useVideoEditor((s) => s.detachAudio);
  const freezeAtPlayhead = useVideoEditor((s) => s.freezeAtPlayhead);
  const replaceClipSource = useVideoEditor((s) => s.replaceClipSource);
  const sources = useVideoEditor((s) => s.sources);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<PropsTab>("video");

  // as ferramentas (cards) podem pedir uma aba específica
  useEffect(() => {
    function onTab(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "video" || detail === "audio" || detail === "anim" || detail === "ajustes") setTab(detail);
    }
    window.addEventListener("studio-props-tab", onTab);
    return () => window.removeEventListener("studio-props-tab", onTab);
  }, []);

  const found = selectedClipId
    ? project.tracks.flatMap((t) => t.clips.map((c) => ({ track: t, clip: c }))).find(({ clip }) => clip.id === selectedClipId)
    : null;

  if (!found) {
    // estado vazio útil (estilo pro): resumo REAL do projeto atual
    const dur = projectDurationMs(project.tracks);
    const clipCount = project.tracks.reduce((n, t) => n + t.clips.length, 0);
    return (
      <div className="anim-rise space-y-3">
        <div className="rounded-2xl bg-white/[0.03] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            <Film className="h-3 w-3" aria-hidden /> Projeto
          </p>
          <dl className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Resolução</dt>
              <dd className="font-mono text-zinc-300">{project.resolution.w}×{project.resolution.h}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Quadros/s</dt>
              <dd className="font-mono text-zinc-300">{project.fps} fps</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Duração</dt>
              <dd className="font-mono text-zinc-300">{(dur / 1000).toFixed(1)}s</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Clipes</dt>
              <dd className="font-mono text-zinc-300">{clipCount}</dd>
            </div>
          </dl>
        </div>
        <p className="px-1 text-center text-[11px] leading-relaxed text-zinc-600">
          Selecione um clipe na timeline para editar as propriedades dele aqui.
        </p>
      </div>
    );
  }

  const { track, clip } = found;
  const isMedia = track.type === "video" || track.type === "audio";
  const isVisual = track.type !== "audio";
  const isVideoClip = track.type === "video" && sources[clip.sourceId]?.kind === "video";
  const name = clip.text?.content ?? sources[clip.sourceId]?.name ?? "Clipe";

  const TABS: { id: PropsTab; label: string }[] = [
    ...(isVisual ? ([{ id: "video", label: "Vídeo" }] as const) : []),
    ...(isMedia ? ([{ id: "audio", label: "Áudio" }] as const) : []),
    ...(isVisual ? ([{ id: "anim", label: "Animação" }] as const) : []),
    ...(isVisual && !clip.text ? ([{ id: "ajustes", label: "Ajustes" }] as const) : []),
  ];
  const activeTab: PropsTab = TABS.some((t) => t.id === tab) ? tab : TABS[0]?.id ?? "video";

  function patchMask(patch: Partial<ClipMask>) {
    updateClip(clip.id, { mask: { ...(clip.mask ?? DEFAULT_MASK), ...patch } });
  }

  async function replaceSource(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const src = await registerFile(file);
    if (src) {
      replaceClipSource(clip.id, src);
      toast("Mídia substituída", { description: src.name });
    } else {
      toast("Formato não suportado", { variant: "error" });
    }
  }

  function patchTransform(patch: Partial<Clip["transform"]>) {
    updateClip(clip.id, { transform: { ...clip.transform, ...patch } });
  }

  /** Ken Burns: gera keyframes de câmera (zoom/pan) ao longo do clipe. */
  function applyKenBurns(kind: "zoomIn" | "zoomOut" | "panRight" | "panLeft") {
    const dur = clip.duration;
    const other = clip.keyframes.filter((k) => k.property !== "scale" && k.property !== "x" && k.property !== "y");
    const kfs: Keyframe[] = [];
    const push = (property: AnimatableProperty, t: number, value: number) =>
      kfs.push({ property, timeMs: Math.round(t), value, easing: "easeInOut" });
    if (kind === "zoomIn") {
      push("scale", 0, 1);
      push("scale", dur, 1.18);
    } else if (kind === "zoomOut") {
      push("scale", 0, 1.18);
      push("scale", dur, 1);
    } else if (kind === "panRight") {
      push("scale", 0, 1.14);
      push("scale", dur, 1.14);
      push("x", 0, -0.06);
      push("x", dur, 0.06);
    } else {
      push("scale", 0, 1.14);
      push("scale", dur, 1.14);
      push("x", 0, 0.06);
      push("x", dur, -0.06);
    }
    updateClip(clip.id, { keyframes: [...other, ...kfs].sort((a, b) => a.timeMs - b.timeMs) });
    toast("Movimento aplicado", { description: "Câmera com keyframes ao longo do clipe (vale no preview e na exportação)." });
  }

  function removeKenBurns() {
    updateClip(clip.id, {
      keyframes: clip.keyframes.filter((k) => k.property !== "scale" && k.property !== "x" && k.property !== "y"),
    });
  }

  const hasKenBurns = clip.keyframes.some((k) => k.property === "scale" || k.property === "x" || k.property === "y");

  function patchColorAdjust(patch: Partial<{ brightness: number; contrast: number; saturation: number; hue: number }>) {
    const base = clip.colorAdjust ?? { brightness: 0, contrast: 0, saturation: 0, hue: 0 };
    const next = { ...base, ...patch };
    const flat = next.brightness === 0 && next.contrast === 0 && next.saturation === 0 && next.hue === 0;
    updateClip(clip.id, { colorAdjust: flat ? undefined : next });
  }

  function patchAudioFx(patch: Partial<{ denoise?: boolean; voice?: boolean }>) {
    const next = { ...(clip.audioFx ?? {}), ...patch };
    const empty = !next.denoise && !next.voice;
    updateClip(clip.id, { audioFx: empty ? undefined : next });
  }

  function patchEq(patch: Partial<{ low: number; mid: number; high: number }>) {
    const base = clip.eq ?? { low: 0, mid: 0, high: 0 };
    const next = { ...base, ...patch };
    const isFlat = next.low === 0 && next.mid === 0 && next.high === 0;
    updateClip(clip.id, { eq: isFlat ? undefined : next });
  }

  function toggleEffect(fxId: string) {
    const has = clip.effects.some((e) => e.id === fxId);
    updateClip(clip.id, {
      effects: has ? clip.effects.filter((e) => e.id !== fxId) : [...clip.effects, { id: fxId, intensity: 0.6 }],
    });
  }

  function setEffectIntensity(fxId: string, intensity: number) {
    updateClip(clip.id, { effects: clip.effects.map((e) => (e.id === fxId ? { ...e, intensity } : e)) });
  }

  /** Adiciona um keyframe da propriedade no instante do playhead (valor atual). */
  function addKeyframe(prop: AnimatableProperty) {
    const clipTime = Math.min(clip.duration, Math.max(0, playheadMs - clip.startInTimeline));
    const value = valueAt(clip, prop, clipTime);
    const kf: Keyframe = { property: prop, timeMs: Math.round(clipTime), value, easing: "easeInOut" };
    const rest = clip.keyframes.filter((k) => !(k.property === prop && Math.abs(k.timeMs - kf.timeMs) < 40));
    updateClip(clip.id, { keyframes: [...rest, kf].sort((a, b) => a.timeMs - b.timeMs) });
  }

  function removeKeyframe(kf: Keyframe) {
    updateClip(clip.id, { keyframes: clip.keyframes.filter((k) => !(k.property === kf.property && k.timeMs === kf.timeMs)) });
  }

  return (
    <div key={clip.id} className="anim-rise space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white" title={name}>
          {name}
        </p>
        <button
          onClick={() => duplicateClip(clip.id)}
          aria-label="Duplicar clipe"
          title="Duplicar clipe"
          className="rounded-lg p-1.5 text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={() => deleteClip(clip.id)}
          aria-label="Apagar clipe"
          title="Apagar clipe"
          className="rounded-lg p-1.5 text-zinc-400 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* abas (estilo referência) */}
      {TABS.length > 1 && (
        <div role="tablist" aria-label="Grupos de propriedades" className="flex gap-1 rounded-xl border border-line bg-surface-1/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                activeTab === t.id ? "bg-violet-500/20 text-violet-200" : "text-zinc-500 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ============================== ABA VÍDEO ============================== */}
      {activeTab === "video" && (
        <>
          {/* ações rápidas (vídeo) */}
          {isVideoClip && (
            <div className="grid grid-cols-3 gap-1.5">
              <ActionButton icon={Snowflake} label="Congelar" onClick={() => freezeAtPlayhead()} />
              <ActionButton icon={Music} label="Extrair áudio" onClick={() => detachAudio(clip.id)} />
              <ActionButton icon={Repeat} label="Substituir" onClick={() => replaceRef.current?.click()} />
              <input
                ref={replaceRef}
                type="file"
                accept="video/*,image/*"
                className="sr-only"
                aria-label="Substituir mídia do clipe"
                onChange={(e) => {
                  void replaceSource(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* texto */}
          {clip.text && (
            <Section title="Texto">
              <textarea
                rows={2}
                value={clip.text.content}
                onChange={(e) => updateClip(clip.id, { text: { ...clip.text!, content: e.target.value } })}
                aria-label="Conteúdo do texto"
                className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              />
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  Cor
                  <input
                    type="color"
                    value={clip.text.color}
                    onChange={(e) => updateClip(clip.id, { text: { ...clip.text!, color: e.target.value } })}
                    aria-label="Cor do texto"
                    className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={clip.text.background != null}
                    onChange={(e) => updateClip(clip.id, { text: { ...clip.text!, background: e.target.checked ? "rgba(0,0,0,0.75)" : null } })}
                    className="accent-violet-500"
                  />
                  Caixa de fundo
                </label>
              </div>
            </Section>
          )}

          <Section title="Transformar">
            <Slider label="Escala" value={clip.transform.scale} min={0.2} max={3} step={0.01} onChange={(v) => patchTransform({ scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Posição X" value={clip.transform.x} min={-0.5} max={0.5} step={0.01} onChange={(v) => patchTransform({ x: v })} format={(v) => `${Math.round(v * 100)}`} />
            <Slider label="Posição Y" value={clip.transform.y} min={-0.5} max={0.5} step={0.01} onChange={(v) => patchTransform({ y: v })} format={(v) => `${Math.round(v * 100)}`} />
            <Slider label="Rotação" value={clip.transform.rotation} min={-180} max={180} step={1} onChange={(v) => patchTransform({ rotation: v })} format={(v) => `${Math.round(v)}°`} />
            <Slider label="Opacidade" value={clip.transform.opacity} min={0} max={1} step={0.01} onChange={(v) => patchTransform({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </Section>

          {/* color grading por clipe (estilo Lumetri) */}
          {!clip.text && (
            <Section title="Cor">
              <GradientSlider
                label="Brilho"
                value={clip.colorAdjust?.brightness ?? 0}
                min={-100}
                max={100}
                gradient="linear-gradient(to right, #18181b, #71717a, #fafafa)"
                onChange={(v) => patchColorAdjust({ brightness: v })}
                format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
              />
              <GradientSlider
                label="Contraste"
                value={clip.colorAdjust?.contrast ?? 0}
                min={-100}
                max={100}
                gradient="linear-gradient(to right, #52525b, #a1a1aa 50%, #f4f4f5)"
                onChange={(v) => patchColorAdjust({ contrast: v })}
                format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
              />
              <GradientSlider
                label="Saturação"
                value={clip.colorAdjust?.saturation ?? 0}
                min={-100}
                max={100}
                gradient="linear-gradient(to right, #8a8a8a, #ff4d4d 35%, #ffd400 60%, #33cc66 80%, #3b82f6)"
                onChange={(v) => patchColorAdjust({ saturation: v })}
                format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
              />
              <GradientSlider
                label="Matiz"
                value={clip.colorAdjust?.hue ?? 0}
                min={-180}
                max={180}
                gradient="linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                onChange={(v) => patchColorAdjust({ hue: v })}
                format={(v) => `${Math.round(v)}°`}
              />
              {clip.colorAdjust && (
                <button
                  onClick={() => updateClip(clip.id, { colorAdjust: undefined })}
                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden /> Redefinir
                </button>
              )}
            </Section>
          )}

          {/* remoção de fundo: IA (sem tela verde) + chroma key */}
          {isVideoClip && (
            <Section title="Remover fundo">
              <div className="mb-2 space-y-1">
                <Switch
                  label="IA sem tela verde (recorta pessoas)"
                  checked={clip.bgRemove === true}
                  onChange={(on) => {
                    updateClip(clip.id, { bgRemove: on || undefined });
                    if (on && !isBgVideoReady()) {
                      toast("Baixando a IA de recorte (~3 MB)…", {
                        description: "O fundo some assim que o modelo carregar. Fica em cache para as próximas vezes.",
                        important: true,
                      });
                    }
                    if (on)
                      void ensureBgVideoSegmenter().then((ok) => {
                        if (!ok)
                          toast("A IA de recorte não carregou", {
                            description: "Verifique a internet e tente de novo — o clipe fica com o fundo até a IA carregar.",
                            variant: "error",
                          });
                      });
                  }}
                />
                <p className="text-[10px] leading-relaxed text-zinc-600">
                  Rotoscopia automática por IA no seu aparelho — melhor com pessoas em destaque. Vale no preview e na exportação.
                </p>
              </div>
              <Switch
                label="Ativar (para vídeos com fundo verde/azul)"
                checked={!!clip.chroma}
                onChange={(on) => updateClip(clip.id, { chroma: on ? { color: "#00b140", tolerance: 0.3, softness: 0.12 } : undefined })}
              />
              {clip.chroma && (
                <div className="mt-2 space-y-1">
                  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                    Cor do fundo
                    <input
                      type="color"
                      value={clip.chroma.color}
                      onChange={(e) => updateClip(clip.id, { chroma: { ...clip.chroma!, color: e.target.value } })}
                      aria-label="Cor do chroma key"
                      className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent"
                    />
                  </label>
                  <Slider label="Tolerância" value={clip.chroma.tolerance} min={0.05} max={0.8} step={0.01} onChange={(v) => updateClip(clip.id, { chroma: { ...clip.chroma!, tolerance: v } })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Suavizar borda" value={clip.chroma.softness} min={0} max={0.5} step={0.01} onChange={(v) => updateClip(clip.id, { chroma: { ...clip.chroma!, softness: v } })} format={(v) => `${Math.round(v * 100)}%`} />
                </div>
              )}
            </Section>
          )}

          {/* máscara */}
          {!clip.text && (
            <Section title="Máscara">
              <div className="grid grid-cols-3 gap-1.5">
                {(["none", "rect", "ellipse"] as const).map((k) => {
                  const active = (clip.mask?.kind ?? "none") === k || (k === "none" && !clip.mask);
                  return (
                    <button
                      key={k}
                      onClick={() => (k === "none" ? updateClip(clip.id, { mask: undefined }) : patchMask({ kind: k }))}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border px-1.5 py-1.5 text-[10px] font-medium transition-colors",
                        active ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
                      )}
                    >
                      {k === "none" ? "Nenhuma" : k === "rect" ? "Retângulo" : "Elipse"}
                    </button>
                  );
                })}
              </div>
              {clip.mask && (
                <div className="mt-2 space-y-1">
                  <Slider label="Posição X" value={clip.mask.x} min={0} max={1} step={0.01} onChange={(v) => patchMask({ x: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Posição Y" value={clip.mask.y} min={0} max={1} step={0.01} onChange={(v) => patchMask({ y: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Largura" value={clip.mask.w} min={0.05} max={1} step={0.01} onChange={(v) => patchMask({ w: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Altura" value={clip.mask.h} min={0.05} max={1} step={0.01} onChange={(v) => patchMask({ h: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Suavizar borda" value={clip.mask.feather} min={0} max={1} step={0.01} onChange={(v) => patchMask({ feather: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <label className="flex items-center gap-1.5 pt-1 text-[11px] text-zinc-400">
                    <input type="checkbox" checked={clip.mask.inverted} onChange={(e) => patchMask({ inverted: e.target.checked })} className="accent-violet-500" />
                    Inverter (mostra o de fora)
                  </label>
                </div>
              )}
            </Section>
          )}

          {/* mesclagem */}
          {!clip.text && (
            <Section title="Composição">
              <select
                value={clip.blendMode}
                onChange={(e) => updateClip(clip.id, { blendMode: e.target.value as BlendMode })}
                aria-label="Modo de mesclagem"
                className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {BLEND_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Section>
          )}
        </>
      )}

      {/* ============================== ABA ÁUDIO ============================== */}
      {activeTab === "audio" && isMedia && (
        <>
          <Section title="Velocidade e som">
            <Slider label="Velocidade" value={clip.speed} min={0.25} max={4} step={0.05} onChange={(v) => setClipSpeed(clip.id, v)} format={(v) => `${v.toFixed(2)}x`} />
            <Slider label="Volume" value={clip.volume} min={0} max={1} step={0.01} onChange={(v) => updateClip(clip.id, { volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider
              label="Fade de entrada"
              value={clip.fadeInMs ?? 0}
              min={0}
              max={3000}
              step={100}
              onChange={(v) => updateClip(clip.id, { fadeInMs: v > 0 ? v : undefined })}
              format={(v) => (v > 0 ? `${(v / 1000).toFixed(1)}s` : "—")}
            />
            <Slider
              label="Fade de saída"
              value={clip.fadeOutMs ?? 0}
              min={0}
              max={3000}
              step={100}
              onChange={(v) => updateClip(clip.id, { fadeOutMs: v > 0 ? v : undefined })}
              format={(v) => (v > 0 ? `${(v / 1000).toFixed(1)}s` : "—")}
            />
          </Section>

          <Section title="Aprimoramento">
            <div className="space-y-2">
              <Switch label="Reduzir ruído (corta ronco e chiado)" checked={clip.audioFx?.denoise === true} onChange={(on) => patchAudioFx({ denoise: on || undefined })} />
              <Switch label="Aprimorar voz (presença + compressão)" checked={clip.audioFx?.voice === true} onChange={(on) => patchAudioFx({ voice: on || undefined })} />
              {(clip.audioFx?.denoise || clip.audioFx?.voice) && (
                <p className="text-[10px] text-zinc-600">Aplicado no arquivo exportado (o preview toca sem o tratamento).</p>
              )}
            </div>
          </Section>

          <Section title="Equalizador">
            <EqSlider label="Graves" value={clip.eq?.low ?? 0} onChange={(v) => patchEq({ low: v })} />
            <EqSlider label="Médios" value={clip.eq?.mid ?? 0} onChange={(v) => patchEq({ mid: v })} />
            <EqSlider label="Agudos" value={clip.eq?.high ?? 0} onChange={(v) => patchEq({ high: v })} />
          </Section>
        </>
      )}

      {/* ============================ ABA ANIMAÇÃO ============================ */}
      {activeTab === "anim" && isVisual && (
        <>
          {!clip.text && (
            <Section title="Movimento (Ken Burns)">
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ["zoomIn", "Zoom in"],
                  ["zoomOut", "Zoom out"],
                  ["panRight", "Panorâmica →"],
                  ["panLeft", "← Panorâmica"],
                ] as const).map(([kind, label]) => (
                  <button
                    key={kind}
                    onClick={() => applyKenBurns(kind)}
                    className="rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {hasKenBurns && (
                <button
                  onClick={removeKenBurns}
                  className="mt-1.5 w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-rose-500/50 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  Remover movimento
                </button>
              )}
              <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">Zoom/panorâmica automáticos por keyframes — ótimo para dar vida a fotos paradas.</p>
            </Section>
          )}

          <Section title="Entrada e saída">
            <AnimPicker
              label="Entrada"
              value={clip.animIn ?? null}
              onChange={(anim) => updateClip(clip.id, { animIn: anim ?? undefined })}
            />
            <AnimPicker
              label="Saída"
              value={clip.animOut ?? null}
              onChange={(anim) => updateClip(clip.id, { animOut: anim ?? undefined })}
            />
          </Section>

          {!clip.text && (
            <Section title="Transição (com o clipe anterior)">
              <select
                value={clip.transitionIn?.id ?? ""}
                onChange={(e) =>
                  updateClip(clip.id, { transitionIn: e.target.value ? { id: e.target.value, durationMs: clip.transitionIn?.durationMs ?? 600 } : undefined })
                }
                aria-label="Transição de entrada"
                className="w-full rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <option value="">Nenhuma</option>
                {TRANSITIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {clip.transitionIn && (
                <div className="mt-2">
                  <Slider
                    label="Duração"
                    value={clip.transitionIn.durationMs}
                    min={200}
                    max={2000}
                    step={50}
                    onChange={(v) => updateClip(clip.id, { transitionIn: { id: clip.transitionIn!.id, durationMs: v } })}
                    format={(v) => `${(v / 1000).toFixed(1)}s`}
                  />
                </div>
              )}
              <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">Precisa de outro clipe colado antes deste na mesma trilha.</p>
            </Section>
          )}

          <Section title="Keyframes (no playhead)">
            <div className="flex flex-wrap gap-1">
              {KF_PROPS.map(({ prop, label }) => (
                <button
                  key={prop}
                  onClick={() => addKeyframe(prop)}
                  title={`Adicionar keyframe de ${label} no playhead`}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-1 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Diamond className="h-2.5 w-2.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            {clip.keyframes.length > 0 && (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {clip.keyframes.map((kf) => (
                  <li key={`${kf.property}-${kf.timeMs}`} className="flex items-center gap-2 rounded-lg bg-surface-1 px-2 py-1 text-[10px] text-zinc-400">
                    <Diamond className="h-2.5 w-2.5 shrink-0 text-violet-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {kf.property} @ {(kf.timeMs / 1000).toFixed(2)}s = {kf.value.toFixed(2)}
                    </span>
                    <button onClick={() => removeKeyframe(kf)} aria-label="Remover keyframe" className="rounded p-0.5 hover:text-rose-400">
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* ============================= ABA AJUSTES ============================= */}
      {activeTab === "ajustes" && isVisual && !clip.text && (
        <>
          <Section title="Filtros e looks">
            <div className="grid grid-cols-3 gap-1.5">
              {CLIP_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => updateClip(clip.id, { filterId: f.id === "none" ? undefined : f.id })}
                  aria-pressed={(clip.filterId ?? "none") === f.id}
                  className={cn(
                    "rounded-lg border px-1.5 py-1.5 text-[10px] font-medium transition-colors",
                    (clip.filterId ?? "none") === f.id
                      ? "border-violet-400 bg-violet-500/20 text-white"
                      : "border-line bg-surface-1 text-zinc-400 hover:text-white",
                  )}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Efeitos">
            <div className="space-y-1.5">
              {OVERLAY_EFFECTS.map((fx) => {
                const active = clip.effects.find((e) => e.id === fx.id);
                return (
                  <div key={fx.id} className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEffect(fx.id)}
                      aria-pressed={!!active}
                      className={cn(
                        "min-w-[96px] rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
                        active ? "border-violet-400 bg-violet-500/20 text-white" : "border-line bg-surface-1 text-zinc-400 hover:text-white",
                      )}
                    >
                      {fx.name}
                    </button>
                    {active && (
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={active.intensity}
                        onChange={(e) => setEffectIntensity(fx.id, Number(e.target.value))}
                        aria-label={`Intensidade de ${fx.name}`}
                        className="min-w-0 flex-1 accent-violet-500"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Music; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface-1 px-1 py-2 text-[10px] font-medium text-zinc-300 transition-all hover:border-violet-500/50 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

/** Interruptor (switch) estilo referência — checkbox real por baixo (a11y). */
function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[11px] text-zinc-300">
      <span className="min-w-0 flex-1">{label}</span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-violet-500" : "bg-white/15")}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        />
        <span
          className={cn(
            "pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
          aria-hidden
        />
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="mb-1.5 block">
      <span className="flex items-center justify-between text-[11px] text-zinc-400">
        {label}
        <span className="font-mono tabular-nums text-zinc-500">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-0.5 w-full accent-violet-500"
      />
    </label>
  );
}

/** Slider com trilho em degradê (Cor, estilo referência). */
function GradientSlider({
  label,
  value,
  min,
  max,
  gradient,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  gradient: string;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="mb-2 block">
      <span className="flex items-center justify-between text-[11px] text-zinc-400">
        {label}
        <span className="font-mono tabular-nums text-zinc-500">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ background: gradient }}
        className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/30 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      />
    </label>
  );
}

function EqSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mb-1.5 block">
      <span className="flex items-center justify-between text-[11px] text-zinc-400">
        {label}
        <span className="font-mono tabular-nums text-zinc-500">{value > 0 ? `+${value}` : value} dB</span>
      </span>
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-0.5 w-full accent-violet-500"
      />
    </label>
  );
}

function AnimPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { id: string; durationMs: number } | null;
  onChange: (anim: { id: string; durationMs: number } | null) => void;
}) {
  return (
    <div className="mb-2">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <select
          value={value?.id ?? ""}
          onChange={(e) => onChange(e.target.value ? { id: e.target.value, durationMs: value?.durationMs ?? 500 } : null)}
          aria-label={`Animação de ${label.toLowerCase()}`}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <option value="">Nenhuma</option>
          {ANIM_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {value && (
          <input
            type="range"
            min={100}
            max={2000}
            step={50}
            value={value.durationMs}
            onChange={(e) => onChange({ id: value.id, durationMs: Number(e.target.value) })}
            aria-label={`Duração da animação de ${label.toLowerCase()}`}
            title={`${value.durationMs}ms`}
            className="w-20 accent-violet-500"
          />
        )}
      </div>
    </div>
  );
}
