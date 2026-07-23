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

// ============================================================================
// CapCut Pro pack (fase 3) — biblioteca de efeitos, filtros, overlays/PiP,
// camada de ajuste, texto animado, stickers com tracking, áudio CapCut,
// estabilização/enhance e auto-montagem. Tudo é aplicado VISUALMENTE no preview
// (filtros CSS / overlays / transforms), com os valores reais guardados no
// EditorDoc (undo/redo). Pontos de processamento real ficam marcados nas UIs.
// ============================================================================

// ---------------------------------------------------------------- biblioteca de efeitos (FX)

export type FxId =
  | "glitch"
  | "rgbSplit"
  | "vhs"
  | "shake"
  | "zoomPulse"
  | "lightLeaks"
  | "filmGrain"
  | "scanlines"
  | "prism"
  | "chromatic";

export interface FxItem {
  enabled: boolean;
  intensity: number; // 0..100
}

export type FxState = Record<FxId, FxItem>;

export const FX_META: { id: FxId; label: string; emoji: string; desc: string }[] = [
  { id: "glitch", label: "Glitch", emoji: "⚡", desc: "Falha digital com deslocamento e matiz" },
  { id: "rgbSplit", label: "RGB Split", emoji: "🔴", desc: "Separação de canais vermelho/ciano" },
  { id: "vhs", label: "VHS", emoji: "📼", desc: "Fita analógica: linhas e ruído de cor" },
  { id: "shake", label: "Tremor", emoji: "💥", desc: "Câmera trêmula rítmica" },
  { id: "zoomPulse", label: "Zoom Pulse", emoji: "🫀", desc: "Pulso de zoom na batida" },
  { id: "lightLeaks", label: "Light Leaks", emoji: "🌅", desc: "Vazamentos de luz quentes" },
  { id: "filmGrain", label: "Granulado", emoji: "🎞️", desc: "Grão de filme analógico" },
  { id: "scanlines", label: "Scanlines", emoji: "📺", desc: "Linhas de varredura CRT" },
  { id: "prism", label: "Prisma", emoji: "🌈", desc: "Dispersão de cor tipo prisma" },
  { id: "chromatic", label: "Aberração", emoji: "👓", desc: "Aberração cromática nas bordas" },
];

export const DEFAULT_FX: FxState = FX_META.reduce((acc, m) => {
  acc[m.id] = { enabled: false, intensity: 60 };
  return acc;
}, {} as FxState);

/** Motion effects animate a wrapper transform (one nested wrapper each). */
export const FX_MOTION: FxId[] = ["glitch", "shake", "zoomPulse"];
/** Overlay effects paint a blended layer over the media. */
export const FX_OVERLAY: FxId[] = ["vhs", "lightLeaks", "filmGrain", "scanlines", "prism"];

/** Extra CSS `filter` contributions from color-fringing effects. */
export function fxFilterString(fx: FxState): string {
  const parts: string[] = [];
  const split = fx.rgbSplit;
  if (split?.enabled) {
    const o = (split.intensity / 100) * 4;
    parts.push(`drop-shadow(${o.toFixed(1)}px 0 rgba(255,0,0,0.6)) drop-shadow(${(-o).toFixed(1)}px 0 rgba(0,255,255,0.6))`);
  }
  const chrom = fx.chromatic;
  if (chrom?.enabled) {
    const o = (chrom.intensity / 100) * 3 + 0.5;
    parts.push(`drop-shadow(${o.toFixed(1)}px 0 rgba(255,60,60,0.45)) drop-shadow(${(-o).toFixed(1)}px 0 rgba(60,120,255,0.45))`);
  }
  if (fx.vhs?.enabled) {
    const k = fx.vhs.intensity / 100;
    parts.push(`saturate(${(1 + k * 0.4).toFixed(2)}) contrast(${(1 + k * 0.12).toFixed(2)})`);
  }
  return parts.join(" ");
}

/** Inline CSS var values that scale a motion effect's magnitude. */
export function fxMotionVars(id: FxId, intensity: number): Record<string, string> {
  const k = intensity / 100;
  if (id === "shake") return { "--fx-amt": `${(k * 8).toFixed(1)}px` };
  if (id === "glitch") return { "--fx-amt": `${(k * 6).toFixed(1)}px` };
  if (id === "zoomPulse") return { "--fx-zoom": (1 + k * 0.12).toFixed(3) };
  return {};
}

/** Data URI (self-contained) SVG noise used by the film-grain overlay. */
export const GRAIN_DATA_URI =
  "data:image/svg+xml;utf8," +
  "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix type='saturate' values='0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>";

// ---------------------------------------------------------------- filtros (looks estilizados)

export type FilterId = "fade" | "filme" | "retro" | "frio" | "quente" | "pb" | "sepia" | "vivido";

export const FILTER_META: { id: FilterId; label: string; emoji: string }[] = [
  { id: "fade", label: "Fade", emoji: "🌫️" },
  { id: "filme", label: "Filme", emoji: "🎬" },
  { id: "retro", label: "Retrô", emoji: "🕹️" },
  { id: "frio", label: "Frio", emoji: "❄️" },
  { id: "quente", label: "Quente", emoji: "🔥" },
  { id: "pb", label: "Preto & Branco", emoji: "⚫" },
  { id: "sepia", label: "Sépia", emoji: "🟤" },
  { id: "vivido", label: "Vívido", emoji: "🌈" },
];

export interface FilterState {
  id: FilterId | null;
  intensity: number; // 0..100
}

export const DEFAULT_FILTER: FilterState = { id: null, intensity: 80 };

export interface FilterCss {
  filter: string;
  overlay?: { color: string; opacity: number; blend: string };
}

/** Stylized filter → CSS filter (+ optional tint overlay), scaled by intensity. */
export function filterCss(id: FilterId | null, intensity: number): FilterCss | null {
  if (!id) return null;
  const k = clamp(intensity, 0, 100) / 100;
  switch (id) {
    case "fade":
      return {
        filter: `contrast(${(1 - 0.28 * k).toFixed(3)}) brightness(${(1 + 0.07 * k).toFixed(3)}) saturate(${(1 - 0.18 * k).toFixed(3)})`,
        overlay: { color: "rgb(232, 226, 214)", opacity: 0.14 * k, blend: "screen" },
      };
    case "filme":
      return { filter: `contrast(${(1 + 0.22 * k).toFixed(3)}) saturate(${(1 - 0.08 * k).toFixed(3)}) sepia(${(0.12 * k).toFixed(3)})` };
    case "retro":
      return {
        filter: `sepia(${(0.5 * k).toFixed(3)}) saturate(${(1 + 0.15 * k).toFixed(3)}) contrast(${(1 - 0.05 * k).toFixed(3)}) hue-rotate(${(-12 * k).toFixed(1)}deg)`,
        overlay: { color: "rgb(120, 90, 60)", opacity: 0.1 * k, blend: "overlay" },
      };
    case "frio":
      return {
        filter: `saturate(${(1 + 0.1 * k).toFixed(3)}) hue-rotate(${(-18 * k).toFixed(1)}deg) brightness(${(1 + 0.02 * k).toFixed(3)})`,
        overlay: { color: "rgb(74, 150, 255)", opacity: 0.12 * k, blend: "soft-light" },
      };
    case "quente":
      return {
        filter: `sepia(${(0.3 * k).toFixed(3)}) saturate(${(1 + 0.18 * k).toFixed(3)}) hue-rotate(${(8 * k).toFixed(1)}deg)`,
        overlay: { color: "rgb(255, 168, 74)", opacity: 0.12 * k, blend: "soft-light" },
      };
    case "pb":
      return { filter: `grayscale(${k.toFixed(3)}) contrast(${(1 + 0.12 * k).toFixed(3)})` };
    case "sepia":
      return { filter: `sepia(${(0.85 * k).toFixed(3)}) contrast(${(1 + 0.05 * k).toFixed(3)}) brightness(${(1 + 0.03 * k).toFixed(3)})` };
    case "vivido":
      return { filter: `saturate(${(1 + 0.6 * k).toFixed(3)}) contrast(${(1 + 0.15 * k).toFixed(3)}) brightness(${(1 + 0.03 * k).toFixed(3)})` };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- overlays + PiP + blend

export type BlendMode = "normal" | "screen" | "multiply" | "overlay" | "lighten" | "darken";

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "screen", label: "Screen" },
  { id: "multiply", label: "Multiply" },
  { id: "overlay", label: "Overlay" },
  { id: "lighten", label: "Lighten" },
  { id: "darken", label: "Darken" },
];

export type OverlayKind = "pip" | "overlay";

export interface OverlayLayer {
  id: string;
  kind: OverlayKind;
  label: string;
  x: number; // normalized center 0..1
  y: number;
  scale: number; // 0.2..1.4
  opacity: number; // 0..1
  blend: BlendMode;
  hue: number; // 0..360 — varies the placeholder swatch
}

/** Deterministic placeholder gradient for an overlay/PiP swatch. */
export function overlaySwatch(hue: number): string {
  return `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 60) % 360}, 70%, 45%))`;
}

// ---------------------------------------------------------------- camada de ajuste

export interface AdjustmentState {
  enabled: boolean;
  brightness: number; // -100..100
  contrast: number;
  saturation: number;
  vibrance: number; // extra saturation punch
  filter: FilterId | null;
}

export const DEFAULT_ADJUSTMENT: AdjustmentState = {
  enabled: false,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  filter: null,
};

/** CSS filter for the adjustment layer (empty when disabled). */
export function adjustmentFilter(adj: AdjustmentState): string {
  if (!adj.enabled) return "";
  const sat = Math.max(0, 1 + (adj.saturation + adj.vibrance * 0.7) / 100);
  const base = [
    `brightness(${(1 + adj.brightness / 140).toFixed(3)})`,
    `contrast(${(1 + adj.contrast / 130).toFixed(3)})`,
    `saturate(${sat.toFixed(3)})`,
  ].join(" ");
  const fc = adj.filter ? filterCss(adj.filter, 80) : null;
  return [base, fc?.filter ?? ""].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- texto animado

export type TextAnimId = "typewriter" | "pop" | "slide" | "bounce" | "glow" | "wave";

export const TEXT_ANIM_META: { id: TextAnimId; label: string; emoji: string; desc: string }[] = [
  { id: "typewriter", label: "Máquina de escrever", emoji: "⌨️", desc: "Digita letra a letra" },
  { id: "pop", label: "Pop", emoji: "✨", desc: "Surge com escala e fade" },
  { id: "slide", label: "Slide", emoji: "➡️", desc: "Desliza de baixo" },
  { id: "bounce", label: "Bounce", emoji: "🏀", desc: "Entra quicando" },
  { id: "glow", label: "Glow", emoji: "💡", desc: "Brilho neon pulsante" },
  { id: "wave", label: "Onda", emoji: "🌊", desc: "Balança em ondas" },
];

export interface AnimatedTextState {
  enabled: boolean;
  text: string;
  preset: TextAnimId;
  loop: boolean;
  color: string;
  sizePx: number; // relative to 1920-tall frame
  position: "topo" | "centro" | "rodapé";
}

export const DEFAULT_ANIMATED_TEXT: AnimatedTextState = {
  enabled: false,
  text: "SEU TÍTULO AQUI",
  preset: "pop",
  loop: true,
  color: "#ffffff",
  sizePx: 44,
  position: "centro",
};

// ---------------------------------------------------------------- stickers com tracking

export interface StickerItem {
  id: string;
  content: string; // emoji / short label
  x: number; // normalized center 0..1
  y: number;
  scale: number; // 0.4..3
  tracking: boolean; // "seguir movimento"
}

export const STICKER_LIBRARY: string[] = [
  "🔥", "😂", "😍", "🤯", "👀", "💯", "✅", "❌", "⭐", "💥",
  "👑", "🎯", "🚀", "❤️", "👍", "🤔", "😱", "🎉", "💸", "📈",
];

/** Sticker position at time `t` — deterministic sine path when tracking is on. */
export function stickerPos(s: StickerItem, t: number): { x: number; y: number } {
  if (!s.tracking) return { x: s.x, y: s.y };
  const x = clamp(s.x + 0.16 * Math.sin(t * 0.9), 0.02, 0.98);
  const y = clamp(s.y + 0.1 * Math.sin(t * 1.4 + 1), 0.02, 0.98);
  return { x, y };
}

// ---------------------------------------------------------------- áudio CapCut

export type VoiceChangerId = "nenhum" | "grave" | "agudo" | "robo" | "eco";

export const VOICE_CHANGERS: { id: VoiceChangerId; label: string; emoji: string }[] = [
  { id: "nenhum", label: "Original", emoji: "🎙️" },
  { id: "grave", label: "Grave", emoji: "🐻" },
  { id: "agudo", label: "Agudo", emoji: "🐿️" },
  { id: "robo", label: "Robô", emoji: "🤖" },
  { id: "eco", label: "Eco", emoji: "🏔️" },
];

export interface AudioCapcut {
  beatSync: boolean;
  bpm: number; // 60..180
  noiseReduction: boolean;
  voiceChanger: VoiceChangerId;
}

export const DEFAULT_AUDIO_CAPCUT: AudioCapcut = {
  beatSync: false,
  bpm: 120,
  noiseReduction: false,
  voiceChanger: "nenhum",
};

/**
 * Deterministic beat markers for the track. Real beat detection would analyze
 * the decoded audio; here we generate an even grid from the chosen BPM with a
 * tiny seeded jitter so it reads like a real "detecção de batidas".
 * // INTEGRAÇÃO real: FFmpeg/backend (onset/beat detection)
 */
export function beatTimes(bpm: number, duration: number): number[] {
  if (bpm <= 0 || duration <= 0) return [];
  const interval = 60 / bpm;
  const out: number[] = [];
  let i = 0;
  for (let t = 0; t <= duration + 1e-6; t += interval, i++) {
    const jitter = i % 4 === 0 ? 0 : (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.02;
    const tt = Math.round((t + jitter) * 100) / 100;
    if (tt >= 0 && tt <= duration) out.push(tt);
  }
  return out;
}

// ---------------------------------------------------------------- estabilização + enhance

export type UpscaleTarget = "720p" | "1080p" | "4K";

export interface ProcessingState {
  stabilize: boolean;
  stabilizeStrength: number; // 0..100
  enhance: boolean;
  upscaleTarget: UpscaleTarget;
}

export const DEFAULT_PROCESSING: ProcessingState = {
  stabilize: false,
  stabilizeStrength: 60,
  enhance: false,
  upscaleTarget: "1080p",
};

// ---------------------------------------------------------------- auto-montagem

export type MontageTempo = "lento" | "médio" | "rápido" | "batida";

export const MONTAGE_TEMPO_BPM: Record<MontageTempo, number> = {
  lento: 60,
  médio: 90,
  rápido: 120,
  batida: 140,
};

export interface MontageState {
  slides: number; // 3..12
  tempo: MontageTempo;
  transition: TransitionType;
  built: boolean; // já aplicado à timeline?
}

export const DEFAULT_MONTAGE: MontageState = {
  slides: 5,
  tempo: "médio",
  transition: "fade",
  built: false,
};

/** Seconds per slide, from tempo (beats-per-slide) — believable montage pacing. */
export function montageSlideDuration(tempo: MontageTempo): number {
  const bpm = MONTAGE_TEMPO_BPM[tempo];
  const beatsPerSlide = tempo === "batida" ? 2 : 4;
  return (60 / bpm) * beatsPerSlide;
}

// ---------------------------------------------------------------- shared

export function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
