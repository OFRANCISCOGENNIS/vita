"use client";

// Inspector do clipe selecionado (painel de propriedades estilo Premiere):
// transformação (escala/posição/rotação/opacidade), velocidade, volume,
// modo de mesclagem, filtros/looks, animações de entrada/saída e texto.
// Cada mudança vira uma ação no store (histórico undo/redo).

import { Copy, Diamond, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANIM_PRESETS } from "@/lib/video-editor/animations";
import { valueAt } from "@/lib/video-editor/engine";
import { CLIP_FILTERS, OVERLAY_EFFECTS } from "@/lib/video-editor/filters";
import type { AnimatableProperty, BlendMode, Clip, Keyframe } from "@/lib/video-editor/model";
import { useVideoEditor } from "@/store/video-editor";

const KF_PROPS: { prop: AnimatableProperty; label: string }[] = [
  { prop: "scale", label: "Escala" },
  { prop: "x", label: "X" },
  { prop: "y", label: "Y" },
  { prop: "rotation", label: "Rot" },
  { prop: "opacity", label: "Opac" },
];

const BLEND_MODES: BlendMode[] = ["normal", "multiply", "screen", "overlay", "lighten", "darken", "difference"];

export function ClipInspector() {
  const project = useVideoEditor((s) => s.project);
  const selectedClipId = useVideoEditor((s) => s.selectedClipId);
  const playheadMs = useVideoEditor((s) => s.playheadMs);
  const updateClip = useVideoEditor((s) => s.updateClip);
  const setClipSpeed = useVideoEditor((s) => s.setClipSpeed);
  const deleteClip = useVideoEditor((s) => s.deleteClip);
  const duplicateClip = useVideoEditor((s) => s.duplicateClip);
  const sources = useVideoEditor((s) => s.sources);

  const found = selectedClipId
    ? project.tracks.flatMap((t) => t.clips.map((c) => ({ track: t, clip: c }))).find(({ clip }) => clip.id === selectedClipId)
    : null;

  if (!found) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-zinc-500">
        Selecione um clipe na timeline para editar as propriedades.
      </p>
    );
  }

  const { track, clip } = found;
  const isMedia = track.type === "video" || track.type === "audio";
  const isVisual = track.type !== "audio";
  const name = clip.text?.content ?? sources[clip.sourceId]?.name ?? "Clipe";

  function patchTransform(patch: Partial<Clip["transform"]>) {
    updateClip(clip.id, { transform: { ...clip.transform, ...patch } });
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
    <div className="space-y-4 text-sm">
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

      {/* transformação */}
      {isVisual && (
        <Section title="Transformação">
          <Slider label="Escala" value={clip.transform.scale} min={0.2} max={3} step={0.01} onChange={(v) => patchTransform({ scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Posição X" value={clip.transform.x} min={-0.5} max={0.5} step={0.01} onChange={(v) => patchTransform({ x: v })} format={(v) => `${Math.round(v * 100)}`} />
          <Slider label="Posição Y" value={clip.transform.y} min={-0.5} max={0.5} step={0.01} onChange={(v) => patchTransform({ y: v })} format={(v) => `${Math.round(v * 100)}`} />
          <Slider label="Rotação" value={clip.transform.rotation} min={-180} max={180} step={1} onChange={(v) => patchTransform({ rotation: v })} format={(v) => `${Math.round(v)}°`} />
          <Slider label="Opacidade" value={clip.transform.opacity} min={0} max={1} step={0.01} onChange={(v) => patchTransform({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </Section>
      )}

      {/* velocidade + volume + fades */}
      {isMedia && (
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
      )}

      {/* efeitos de sobreposição */}
      {isVisual && !clip.text && (
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
      )}

      {/* keyframes */}
      {isVisual && (
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
      )}

      {/* filtros */}
      {isVisual && !clip.text && (
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
      )}

      {/* animações de entrada/saída */}
      {isVisual && (
        <Section title="Animações">
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
      )}

      {/* mesclagem */}
      {isVisual && !clip.text && (
        <Section title="Mesclagem">
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
    </div>
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
