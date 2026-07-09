// Pure helpers for the advanced editor's visual effects. Shared by the editor
// preview (video) and the Estúdio de Capa (image). No React, no DOM — just math
// that turns edit-state values into CSS filters / transforms / interpolated
// keyframe values, so effects are actually SEEN on the placeholder media.

// ---------------------------------------------------------------- color grade

export type LookId = "cinematic" | "vintage" | "vibrante" | "pb" | "quente" | "frio";

export interface ColorGrade {
  brightness: number; // -100..100 (0 = neutro)
  contrast: number; // -100..100
  saturation: number; // -100..100
  temperature: number; // -100 (frio) .. 100 (quente)
  tint: number; // -100 (verde) .. 100 (magenta)
  exposure: number; // -100..100
  vignette: number; // 0..100
  look: LookId | null;
}

export const NEUTRAL_GRADE: ColorGrade = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  exposure: 0,
  vignette: 0,
  look: null,
};

export const LOOKS: { id: LookId; label: string; emoji: string; values: Omit<ColorGrade, "look"> }[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    emoji: "🎬",
    values: { brightness: -4, contrast: 22, saturation: -8, temperature: -14, tint: 6, exposure: -3, vignette: 42 },
  },
  {
    id: "vintage",
    label: "Vintage",
    emoji: "📼",
    values: { brightness: 6, contrast: -8, saturation: -22, temperature: 28, tint: -8, exposure: 4, vignette: 30 },
  },
  {
    id: "vibrante",
    label: "Vibrante",
    emoji: "🌈",
    values: { brightness: 6, contrast: 16, saturation: 42, temperature: 4, tint: 0, exposure: 6, vignette: 6 },
  },
  {
    id: "pb",
    label: "P&B",
    emoji: "⚫",
    values: { brightness: 2, contrast: 18, saturation: -100, temperature: 0, tint: 0, exposure: 0, vignette: 20 },
  },
  {
    id: "quente",
    label: "Quente",
    emoji: "🔥",
    values: { brightness: 4, contrast: 8, saturation: 14, temperature: 46, tint: 6, exposure: 4, vignette: 10 },
  },
  {
    id: "frio",
    label: "Frio",
    emoji: "❄️",
    values: { brightness: 0, contrast: 10, saturation: 6, temperature: -44, tint: -6, exposure: 0, vignette: 12 },
  },
];

/** Builds a CSS `filter` string that visually approximates the grade. */
export function colorGradeToFilter(cg: ColorGrade): string {
  const brightness = 1 + (cg.brightness + cg.exposure * 0.6) / 140;
  const contrast = 1 + cg.contrast / 130;
  const saturation = Math.max(0, 1 + cg.saturation / 100);
  const hue = cg.tint * 0.5 + cg.temperature * 0.12;
  const sepia = cg.temperature > 0 ? Math.min(0.6, cg.temperature / 240) : 0;
  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturation.toFixed(3)})`,
    `hue-rotate(${hue.toFixed(1)}deg)`,
    sepia > 0 ? `sepia(${sepia.toFixed(3)})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Temperature/tint colored wash rendered over the media (blend: soft-light). */
export function temperatureWash(cg: ColorGrade): { color: string; opacity: number } | null {
  const strength = Math.abs(cg.temperature) / 100;
  if (strength < 0.02 && Math.abs(cg.tint) < 2) return null;
  let color: string;
  if (cg.temperature >= 0) color = "rgb(255, 168, 74)"; // quente
  else color = "rgb(74, 150, 255)"; // frio
  if (Math.abs(cg.tint) > Math.abs(cg.temperature)) {
    color = cg.tint >= 0 ? "rgb(255, 90, 210)" : "rgb(120, 230, 120)";
  }
  return { color, opacity: Math.min(0.5, Math.max(strength, Math.abs(cg.tint) / 100) * 0.55) };
}

/** Radial vignette overlay CSS background (transparent center → dark edges). */
export function vignetteBackground(cg: ColorGrade): string | null {
  if (cg.vignette <= 0) return null;
  const a = Math.min(0.85, cg.vignette / 100);
  return `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${a.toFixed(2)}) 120%)`;
}

// ---------------------------------------------------------------- easing

export type EaseId = "linear" | "easeIn" | "easeOut" | "easeInOut";

export function ease(id: EaseId, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (id) {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    default:
      return x;
  }
}

// ---------------------------------------------------------------- speed

export interface SpeedKeyframe {
  t: number; // seconds (relative to cut)
  rate: number; // 0.25..4
}

export interface SpeedState {
  rate: number; // base per-clip rate
  keyframes: SpeedKeyframe[];
}

export const DEFAULT_SPEED: SpeedState = { rate: 1, keyframes: [] };

/** Effective playback rate at time `t` (linearly ramped between keyframes). */
export function speedAt(speed: SpeedState, t: number): number {
  const kfs = speed.keyframes;
  if (kfs.length === 0) return speed.rate;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return sorted[0].rate;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].rate;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.rate + (b.rate - a.rate) * f;
    }
  }
  return speed.rate;
}

// ---------------------------------------------------------------- reframe

export interface ReframeKeyframe {
  t: number;
  zoom: number;
  panX: number; // -1..1
  panY: number; // -1..1
  rotation: number; // degrees
}

export interface ReframeState {
  zoom: number; // 1..4
  panX: number; // -1..1
  panY: number; // -1..1
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  keyframes: ReframeKeyframe[];
}

export const DEFAULT_REFRAME: ReframeState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  keyframes: [],
};

export interface ReframeSample {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
}

/** Reframe values at time `t` — interpolated across keyframes when present. */
export function reframeAt(r: ReframeState, t: number): ReframeSample {
  const base: ReframeSample = { zoom: r.zoom, panX: r.panX, panY: r.panY, rotation: r.rotation };
  const kfs = r.keyframes;
  if (kfs.length === 0) return base;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return pickReframe(sorted[0]);
  if (t >= sorted[sorted.length - 1].t) return pickReframe(sorted[sorted.length - 1]);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = ease("easeInOut", b.t === a.t ? 0 : (t - a.t) / (b.t - a.t));
      return {
        zoom: lerp(a.zoom, b.zoom, f),
        panX: lerp(a.panX, b.panX, f),
        panY: lerp(a.panY, b.panY, f),
        rotation: lerp(a.rotation, b.rotation, f),
      };
    }
  }
  return base;
}

function pickReframe(k: ReframeKeyframe): ReframeSample {
  return { zoom: k.zoom, panX: k.panX, panY: k.panY, rotation: k.rotation };
}

/** CSS transform for a reframe sample (origin center). */
export function reframeTransform(s: ReframeSample, flipH: boolean, flipV: boolean): string {
  const sx = s.zoom * (flipH ? -1 : 1);
  const sy = s.zoom * (flipV ? -1 : 1);
  const range = (1 - 1 / Math.max(1, s.zoom)) * 50; // % headroom for panning
  const tx = s.panX * range;
  const ty = s.panY * range;
  return `rotate(${s.rotation.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%)`;
}

/** The visible reframe window as a normalized rect (for the overlay box). */
export function reframeWindow(s: ReframeSample): { x: number; y: number; w: number; h: number } {
  const size = 1 / Math.max(1, s.zoom);
  const room = 1 - size;
  const cx = 0.5 + s.panX * (room / 2);
  const cy = 0.5 + s.panY * (room / 2);
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

// ---------------------------------------------------------------- chroma key

export interface ChromaState {
  enabled: boolean;
  keyColor: string; // hex
  tolerance: number; // 0..100
  softness: number; // 0..100
  showBefore: boolean;
}

export const DEFAULT_CHROMA: ChromaState = {
  enabled: false,
  keyColor: "#00d000",
  tolerance: 42,
  softness: 20,
  showBefore: false,
};

// ---------------------------------------------------------------- layer keyframes

export type LayerAnimId = "headline" | "logo" | "sticker";

export interface LayerKeyframe {
  t: number;
  x: number; // normalized offset -0.5..0.5
  y: number;
  scale: number; // 0.2..3
  opacity: number; // 0..1
  rotation: number; // deg
  ease: EaseId;
}

export interface LayersAnim {
  headline: LayerKeyframe[];
  logo: LayerKeyframe[];
  sticker: LayerKeyframe[];
}

export const DEFAULT_LAYERS_ANIM: LayersAnim = { headline: [], logo: [], sticker: [] };

export interface LayerSample {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  rotation: number;
}

export const NEUTRAL_LAYER_SAMPLE: LayerSample = { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0 };

/** Interpolated transform for a layer at time `t`, or null when un-animated. */
export function layerAnimAt(kfs: LayerKeyframe[], t: number): LayerSample | null {
  if (!kfs || kfs.length === 0) return null;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return pickLayer(sorted[0]);
  if (t >= sorted[sorted.length - 1].t) return pickLayer(sorted[sorted.length - 1]);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = ease(b.ease, b.t === a.t ? 0 : (t - a.t) / (b.t - a.t));
      return {
        x: lerp(a.x, b.x, f),
        y: lerp(a.y, b.y, f),
        scale: lerp(a.scale, b.scale, f),
        opacity: lerp(a.opacity, b.opacity, f),
        rotation: lerp(a.rotation, b.rotation, f),
      };
    }
  }
  return pickLayer(sorted[sorted.length - 1]);
}

function pickLayer(k: LayerKeyframe): LayerSample {
  return { x: k.x, y: k.y, scale: k.scale, opacity: k.opacity, rotation: k.rotation };
}

// ---------------------------------------------------------------- transitions

export type TransitionType = "fade" | "slide" | "zoom" | "glitch" | "whip";

export interface Transition {
  at: number; // split boundary time (relative seconds)
  type: TransitionType;
  duration: number; // seconds
}

export const TRANSITION_META: { id: TransitionType; label: string; emoji: string }[] = [
  { id: "fade", label: "Fade", emoji: "🌫️" },
  { id: "slide", label: "Slide", emoji: "➡️" },
  { id: "zoom", label: "Zoom", emoji: "🔍" },
  { id: "glitch", label: "Glitch", emoji: "⚡" },
  { id: "whip", label: "Whip", emoji: "💨" },
];

// ---------------------------------------------------------------- masks

export type MaskKind = "blur" | "pixelate" | "spotlight" | "shape";
export type MaskShape = "rect" | "ellipse";

export interface MaskRegion {
  id: string;
  kind: MaskKind;
  shape: MaskShape;
  x: number; // normalized 0..1 (top-left)
  y: number;
  w: number;
  h: number;
  intensity: number; // 0..100
}

export const MASK_META: { id: MaskKind; label: string; emoji: string; desc: string }[] = [
  { id: "blur", label: "Desfoque", emoji: "🌀", desc: "Borra a região (censura suave)" },
  { id: "pixelate", label: "Pixelizar", emoji: "🟦", desc: "Pixeliza rostos/dados sensíveis" },
  { id: "spotlight", label: "Holofote", emoji: "🔦", desc: "Escurece tudo fora da região" },
  { id: "shape", label: "Forma", emoji: "⬛", desc: "Tarja/forma sólida por cima" },
];

// ---------------------------------------------------------------- audio

export interface AudioAdvanced {
  fadeInSec: number;
  fadeOutSec: number;
  eqLow: number; // -12..12 dB
  eqMid: number;
  eqHigh: number;
}

export const DEFAULT_AUDIO_ADVANCED: AudioAdvanced = {
  fadeInSec: 0.5,
  fadeOutSec: 0.8,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
};

// ---------------------------------------------------------------- shared

export function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
