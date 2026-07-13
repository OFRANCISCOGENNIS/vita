// Editor de Fotos — pure canvas/ImageData image-processing engine (no deps).
//
// Everything here is 100% client-side and static-export safe: plain functions
// over HTMLCanvasElement/ImageData, no DOM globals at module scope, no fetch.
//
// PERFORMANCE MODEL (never freeze the UI >100ms on typical 12MP photos):
//  - Live/interactive edits always run on a DOWNSCALED PREVIEW (~1.4MP kept in
//    the photo-editor store). At that size the per-pixel passes below cost
//    single-digit-to-low-tens of ms each and are scheduled via rAF upstream.
//  - The FULL-RESOLUTION image only goes through the pipeline on export /
//    explicit "aplicar" actions, behind a busy state.
//  - Tone math (exposure/brightness/contrast/levels/curves/temp/tint/filter)
//    is folded into three 256-entry LUTs, so the hot loop is array lookups.
//  - Brushes mutate only a small patch around the stamp (getImageData of a
//    local rect), so cost is bounded by brush size, not by image size.

import { sharpenImageData, type Rgb } from "./canvas-fx";
import { drawCapaText, type CapaTextStyle } from "./capa";

// --------------------------------------------------------------------------
// Types + neutral values
// --------------------------------------------------------------------------

export interface Adjustments {
  exposure: number; // -100..100 (± ~1.5 stops)
  brightness: number; // -100..100
  contrast: number; // -100..100
  highlights: number; // -100..100 (negative recovers highlights)
  shadows: number; // -100..100 (positive lifts shadows)
  saturation: number; // -100..100
  vibrance: number; // -100..100 (protects already-saturated pixels)
  temperature: number; // -100..100 (blue ⇄ amber)
  tint: number; // -100..100 (green ⇄ magenta)
  sharpen: number; // 0..100 (unsharp mask)
  blur: number; // 0..100 (gaussian-ish box blur)
  clarity: number; // -100..100 (local contrast)
  vignette: number; // 0..100
  grain: number; // 0..100
}

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  saturation: 0, vibrance: 0, temperature: 0, tint: 0,
  sharpen: 0, blur: 0, clarity: 0, vignette: 0, grain: 0,
};

export interface CurvePoint { x: number; y: number } // both 0..255
export type CurveChannel = "master" | "r" | "g" | "b";
export type CurvesState = Record<CurveChannel, CurvePoint[]>;

export const identityCurve = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 255, y: 255 }];
export const neutralCurves = (): CurvesState => ({
  master: identityCurve(), r: identityCurve(), g: identityCurve(), b: identityCurve(),
});

export interface LevelsState { black: number; white: number; gamma: number }
export const NEUTRAL_LEVELS: LevelsState = { black: 0, white: 255, gamma: 1 };

export type HslBandId =
  | "vermelhos" | "laranjas" | "amarelos" | "verdes"
  | "cianos" | "azuis" | "roxos" | "magentas";

export interface HslShift { h: number; s: number; l: number } // each -100..100

export const HSL_BANDS: { id: HslBandId; label: string; hue: number; swatch: string }[] = [
  { id: "vermelhos", label: "Vermelhos", hue: 0, swatch: "#ef4444" },
  { id: "laranjas", label: "Laranjas", hue: 30, swatch: "#f97316" },
  { id: "amarelos", label: "Amarelos", hue: 60, swatch: "#eab308" },
  { id: "verdes", label: "Verdes", hue: 120, swatch: "#22c55e" },
  { id: "cianos", label: "Cianos", hue: 180, swatch: "#06b6d4" },
  { id: "azuis", label: "Azuis", hue: 240, swatch: "#3b82f6" },
  { id: "roxos", label: "Roxos", hue: 280, swatch: "#8b5cf6" },
  { id: "magentas", label: "Magentas", hue: 320, swatch: "#d946ef" },
];

export type HslState = Record<HslBandId, HslShift>;
export const neutralHsl = (): HslState => {
  const out = {} as HslState;
  for (const b of HSL_BANDS) out[b.id] = { h: 0, s: 0, l: 0 };
  return out;
};

export interface GeomState { angle: number; flipH: boolean; flipV: boolean }
export const NEUTRAL_GEOM: GeomState = { angle: 0, flipH: false, flipV: false };

// --------------------------------------------------------------------------
// Element layers (texto, emoji, formas, marca d'água) — drawn on top of the
// photo, never affected by the color pipeline.
// --------------------------------------------------------------------------

export type ShapeKind = "retangulo" | "circulo" | "seta";

interface LayerBase {
  id: string;
  opacity: number; // 0..1
  visible: boolean;
}
export interface TextLayer extends LayerBase {
  kind: "texto";
  text: string;
  x: number; y: number; // 0..1 (center)
  size: number; // fraction of canvas height
  style: CapaTextStyle;
  color: string;
  accent: string;
}
export interface EmojiLayer extends LayerBase {
  kind: "emoji";
  emoji: string;
  x: number; y: number;
  size: number;
}
export interface ShapeLayer extends LayerBase {
  kind: "forma";
  shape: ShapeKind;
  x: number; y: number; // center
  w: number; h: number; // 0..1 of canvas
  color: string;
  fill: boolean;
  strokeWidth: number; // fraction of min dimension (0.002..0.03)
}
export interface WatermarkLayer extends LayerBase {
  kind: "marca";
  dataUrl: string;
  x: number; y: number;
  size: number; // width as fraction of canvas width
}
export type ElementLayer = TextLayer | EmojiLayer | ShapeLayer | WatermarkLayer;

// --------------------------------------------------------------------------
// Full parametric state of the editor (non-destructive part)
// --------------------------------------------------------------------------

export type FilterId =
  | "retro" | "filme" | "sepia" | "pb-dramatico" | "kodak" | "fuji"
  | "teal-orange" | "dourado" | "frio-nordico" | "vintage-lavado"
  | "neon" | "soft-matte";

export interface FilterState { id: FilterId | null; intensity: number } // 0..100

export interface PhotoParams {
  adj: Adjustments;
  curves: CurvesState;
  levels: LevelsState;
  hsl: HslState;
  filter: FilterState;
  geom: GeomState;
  layers: ElementLayer[];
}

export function neutralParams(): PhotoParams {
  return {
    adj: { ...NEUTRAL_ADJUSTMENTS },
    curves: neutralCurves(),
    levels: { ...NEUTRAL_LEVELS },
    hsl: neutralHsl(),
    filter: { id: null, intensity: 80 },
    geom: { ...NEUTRAL_GEOM },
    layers: [],
  };
}

// --------------------------------------------------------------------------
// Filter recipes — each look is a parametric recipe (adjustment deltas +
// optional channel curves + matte lift + BW/sépia mix), scaled by intensity.
// --------------------------------------------------------------------------

interface FilterRecipe {
  adj?: Partial<Adjustments>;
  curves?: Partial<Record<CurveChannel, CurvePoint[]>>;
  matte?: number; // lifts blacks (0..60)
  bw?: boolean;
  sepia?: boolean;
}

export const FILTERS: { id: FilterId; label: string; recipe: FilterRecipe }[] = [
  {
    id: "retro", label: "Retrô",
    recipe: { adj: { contrast: -10, saturation: -22, temperature: 24, vignette: 22, grain: 12 }, matte: 22 },
  },
  {
    id: "filme", label: "Filme",
    recipe: {
      adj: { contrast: 14, saturation: -10, shadows: 10, grain: 16 },
      matte: 14,
      curves: { b: [{ x: 0, y: 14 }, { x: 128, y: 128 }, { x: 255, y: 242 }] },
    },
  },
  { id: "sepia", label: "Sépia", recipe: { sepia: true, adj: { contrast: 8, brightness: 4, vignette: 12 } } },
  { id: "pb-dramatico", label: "P&B Dramático", recipe: { bw: true, adj: { contrast: 38, clarity: 28, grain: 10, vignette: 18 } } },
  {
    id: "kodak", label: "Kodak-like",
    recipe: {
      adj: { temperature: 18, tint: 6, saturation: 16, contrast: 10, shadows: 8 },
      curves: { r: [{ x: 0, y: 6 }, { x: 128, y: 136 }, { x: 255, y: 255 }] },
    },
  },
  {
    id: "fuji", label: "Fuji-like",
    recipe: {
      adj: { temperature: -6, tint: -10, saturation: 8, contrast: 6, highlights: -10 },
      curves: { g: [{ x: 0, y: 6 }, { x: 128, y: 132 }, { x: 255, y: 252 }] },
    },
  },
  {
    id: "teal-orange", label: "Teal & Orange",
    recipe: {
      adj: { saturation: 14, contrast: 14, temperature: 10 },
      curves: {
        r: [{ x: 0, y: 0 }, { x: 64, y: 52 }, { x: 192, y: 206 }, { x: 255, y: 255 }],
        b: [{ x: 0, y: 30 }, { x: 128, y: 128 }, { x: 255, y: 224 }],
      },
    },
  },
  { id: "dourado", label: "Dourado", recipe: { adj: { temperature: 36, tint: 6, brightness: 6, saturation: 12, vignette: 16 } } },
  {
    id: "frio-nordico", label: "Frio Nórdico",
    recipe: {
      adj: { temperature: -30, saturation: -16, contrast: -4, brightness: 4 },
      curves: { b: [{ x: 0, y: 18 }, { x: 255, y: 255 }] },
    },
  },
  { id: "vintage-lavado", label: "Vintage Lavado", recipe: { adj: { contrast: -24, saturation: -26, brightness: 8, temperature: 12 }, matte: 36 } },
  {
    id: "neon", label: "Neon",
    recipe: {
      adj: { saturation: 42, vibrance: 20, contrast: 20, tint: 14 },
      curves: { b: [{ x: 0, y: 22 }, { x: 255, y: 255 }] },
    },
  },
  { id: "soft-matte", label: "Soft Matte", recipe: { adj: { contrast: -12, saturation: -8, brightness: 6, highlights: -14 }, matte: 30 } },
];

/** Merges the active filter recipe (scaled by intensity) into the user adjustments. */
export function effectiveAdjustments(adj: Adjustments, filter: FilterState): Adjustments {
  if (!filter.id) return adj;
  const def = FILTERS.find((f) => f.id === filter.id);
  if (!def?.recipe.adj) return adj;
  const k = filter.intensity / 100;
  const out = { ...adj };
  for (const key of Object.keys(def.recipe.adj) as (keyof Adjustments)[]) {
    out[key] = clampRange(out[key] + (def.recipe.adj[key] ?? 0) * k, key);
  }
  return out;
}

function clampRange(v: number, key: keyof Adjustments): number {
  const min = key === "sharpen" || key === "blur" || key === "vignette" || key === "grain" ? 0 : -100;
  return Math.max(min, Math.min(100, v));
}

// --------------------------------------------------------------------------
// Tone curves — monotone cubic (Fritsch–Carlson) through the control points,
// sampled into a 256-entry LUT. Monotonicity avoids the "S overshoot" of
// naive Catmull-Rom when points get close together.
// --------------------------------------------------------------------------

export function buildCurveLUT(points: CurvePoint[]): Float32Array {
  const lut = new Float32Array(256);
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  if (pts.length === 1) {
    lut.fill(pts[0].y);
    return lut;
  }
  const n = pts.length;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  // Secant slopes
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  // Tangents (Fritsch–Carlson)
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  // Sample
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) { lut[x] = ys[0]; continue; }
    if (x >= xs[n - 1]) { lut[x] = ys[n - 1]; continue; }
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const h = Math.max(1e-6, xs[seg + 1] - xs[seg]);
    const t = (x - xs[seg]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    lut[x] = Math.max(0, Math.min(255, h00 * ys[seg] + h10 * h * m[seg] + h01 * ys[seg + 1] + h11 * h * m[seg + 1]));
  }
  return lut;
}

function sampleLUT(lut: Float32Array, v: number): number {
  const c = Math.max(0, Math.min(255, v));
  const i = Math.floor(c);
  const f = c - i;
  return i >= 255 ? lut[255] : lut[i] * (1 - f) + lut[i + 1] * f;
}

function isIdentityCurve(pts: CurvePoint[]): boolean {
  return pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 255 && pts[1].y === 255;
}

/**
 * Folds exposure → brightness → contrast → levels → curves → matte → temp/tint
 * into three per-channel 256-entry LUTs, so the hot pixel loop is pure lookups.
 */
export function buildChannelLUTs(
  adj: Adjustments,
  curves: CurvesState,
  levels: LevelsState,
  filter: FilterState,
): { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray; identity: boolean } {
  const def = filter.id ? FILTERS.find((f) => f.id === filter.id) : null;
  const k = filter.intensity / 100;
  const matte = (def?.recipe.matte ?? 0) * k;

  const expMul = Math.pow(2, (adj.exposure / 100) * 1.5);
  const briAdd = adj.brightness * 0.8;
  const conMul = Math.max(0, 1 + adj.contrast / 100);
  const lo = Math.min(levels.black, 250);
  const hi = Math.max(levels.white, lo + 4);
  const invRange = 255 / (hi - lo);
  const invGamma = 1 / Math.max(0.1, levels.gamma);

  const masterLUT = isIdentityCurve(curves.master) ? null : buildCurveLUT(curves.master);
  const chanLUT: Record<"r" | "g" | "b", Float32Array | null> = {
    r: isIdentityCurve(curves.r) ? null : buildCurveLUT(curves.r),
    g: isIdentityCurve(curves.g) ? null : buildCurveLUT(curves.g),
    b: isIdentityCurve(curves.b) ? null : buildCurveLUT(curves.b),
  };
  const filterLUT: Partial<Record<CurveChannel, Float32Array>> = {};
  if (def?.recipe.curves) {
    for (const ch of Object.keys(def.recipe.curves) as CurveChannel[]) {
      filterLUT[ch] = buildCurveLUT(def.recipe.curves[ch]!);
    }
  }

  // temp/tint as per-channel offsets (amber/blue + magenta/green)
  const tR = adj.temperature * 0.45 + adj.tint * 0.18;
  const tG = -adj.tint * 0.4;
  const tB = -adj.temperature * 0.45 + adj.tint * 0.18;

  const out = {
    r: new Uint8ClampedArray(256),
    g: new Uint8ClampedArray(256),
    b: new Uint8ClampedArray(256),
    identity: false,
  };

  const channels: ("r" | "g" | "b")[] = ["r", "g", "b"];
  let identity = true;
  for (const ch of channels) {
    const offset = ch === "r" ? tR : ch === "g" ? tG : tB;
    for (let i = 0; i < 256; i++) {
      let v = i * expMul; // exposure
      v += briAdd; // brightness
      v = (v - 128) * conMul + 128; // contrast
      v = (v - lo) * invRange; // levels black/white
      v = 255 * Math.pow(Math.max(0, Math.min(1, v / 255)), invGamma); // levels gamma
      if (masterLUT) v = sampleLUT(masterLUT, v);
      const fm = filterLUT.master;
      if (fm) v = v + (sampleLUT(fm, v) - v) * k;
      if (matte > 0) v = matte + (v * (255 - matte)) / 255; // lifted blacks
      const cl = chanLUT[ch];
      if (cl) v = sampleLUT(cl, v);
      const fl = filterLUT[ch];
      if (fl) v = v + (sampleLUT(fl, v) - v) * k;
      v += offset; // temperature/tint
      const q = Math.max(0, Math.min(255, Math.round(v)));
      out[ch][i] = q;
      if (q !== i) identity = false;
    }
  }
  out.identity = identity;
  return out;
}

// --------------------------------------------------------------------------
// Per-pixel color pass — highlights/shadows, saturation/vibrance, HSL bands
// and the filter's BW/sépia mix. One single loop over the buffer.
// --------------------------------------------------------------------------

interface ColorPassOpts {
  highlights: number;
  shadows: number;
  saturation: number;
  vibrance: number;
  hsl: HslState;
  bw: number; // 0..1
  sepia: number; // 0..1
}

function colorPassNeeded(o: ColorPassOpts): boolean {
  if (o.highlights || o.shadows || o.saturation || o.vibrance || o.bw > 0 || o.sepia > 0) return true;
  for (const b of HSL_BANDS) {
    const s = o.hsl[b.id];
    if (s.h || s.s || s.l) return true;
  }
  return false;
}

/** Circular hue distance in degrees (0..180). */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function applyColorPass(img: ImageData, o: ColorPassOpts): void {
  if (!colorPassNeeded(o)) return;
  const data = img.data;
  const activeBands = HSL_BANDS.filter((b) => {
    const s = o.hsl[b.id];
    return s.h !== 0 || s.s !== 0 || s.l !== 0;
  }).map((b) => ({ hue: b.hue, shift: o.hsl[b.id] }));

  const doHS = o.highlights !== 0 || o.shadows !== 0;
  const doSat = o.saturation !== 0 || o.vibrance !== 0;
  const satBase = 1 + o.saturation / 100;
  const vib = o.vibrance / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Highlights / shadows: luma-weighted lift (squared weights keep midtones stable)
    if (doHS) {
      const wl = luma / 255;
      const add = o.highlights * 0.55 * wl * wl + o.shadows * 0.55 * (1 - wl) * (1 - wl);
      if (add !== 0) {
        r += add; g += add; b += add;
        luma += add;
      }
    }

    // HSL per-band shifts (only pixels with some chroma have a meaningful hue)
    if (activeBands.length > 0) {
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const delta = mx - mn;
      if (delta > 4) {
        let h: number;
        if (mx === r) h = 60 * (((g - b) / delta) % 6);
        else if (mx === g) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
        if (h < 0) h += 360;
        const l = (mx + mn) / 510;
        let s = delta / (255 - Math.abs(2 * l * 255 - 255) || 1);
        let dh = 0, dsMul = 1, dl = 0, wSum = 0;
        for (const band of activeBands) {
          const w = Math.max(0, 1 - hueDist(h, band.hue) / 50); // triangular kernel ±50°
          if (w <= 0) continue;
          wSum += w;
          dh += band.shift.h * 0.3 * w; // ±30° max
          dsMul *= 1 + (band.shift.s / 100) * w;
          dl += (band.shift.l / 100) * 0.35 * w;
        }
        if (wSum > 0) {
          let nh = (h + dh) % 360;
          if (nh < 0) nh += 360;
          s = Math.max(0, Math.min(1, s * dsMul));
          const nl = Math.max(0, Math.min(1, l + dl));
          // hsl → rgb
          const c = (1 - Math.abs(2 * nl - 1)) * s;
          const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
          const m0 = nl - c / 2;
          let r1 = 0, g1 = 0, b1 = 0;
          if (nh < 60) { r1 = c; g1 = x; }
          else if (nh < 120) { r1 = x; g1 = c; }
          else if (nh < 180) { g1 = c; b1 = x; }
          else if (nh < 240) { g1 = x; b1 = c; }
          else if (nh < 300) { r1 = x; b1 = c; }
          else { r1 = c; b1 = x; }
          r = (r1 + m0) * 255;
          g = (g1 + m0) * 255;
          b = (b1 + m0) * 255;
          luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
      }
    }

    // Saturation + vibrance (vibrance boosts low-chroma pixels more)
    if (doSat) {
      let sat = satBase;
      if (vib !== 0) {
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        sat += vib * (1 - (mx - mn) / 255);
      }
      r = luma + (r - luma) * sat;
      g = luma + (g - luma) * sat;
      b = luma + (b - luma) * sat;
    }

    // Filter-driven monochrome mixes
    if (o.bw > 0) {
      r = r + (luma - r) * o.bw;
      g = g + (luma - g) * o.bw;
      b = b + (luma - b) * o.bw;
    }
    if (o.sepia > 0) {
      const sr = Math.min(255, luma * 1.09 + 22);
      const sg = Math.min(255, luma * 0.94 + 8);
      const sb = luma * 0.72;
      r = r + (sr - r) * o.sepia;
      g = g + (sg - g) * o.sepia;
      b = b + (sb - b) * o.sepia;
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

// --------------------------------------------------------------------------
// Spatial effects: box blur (gaussian-ish), clarity (local contrast),
// vignette, grain.
// --------------------------------------------------------------------------

/**
 * Separable box blur, `passes` iterations ≈ gaussian. Blurs RGBA (alpha too,
 * so it composes with the background eraser). Mutates in place.
 */
export function boxBlurImageData(img: ImageData, radius: number, passes = 2): void {
  const r = Math.max(1, Math.round(radius));
  const { width: w, height: h, data } = img;
  const tmp = new Uint8ClampedArray(data.length);
  for (let p = 0; p < passes; p++) {
    blurAxis(data, tmp, w, h, r, true);
    blurAxis(tmp, data, w, h, r, false);
  }
}

function blurAxis(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean): void {
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const stride = horizontal ? 4 : w * 4;
  const lineStride = horizontal ? w * 4 : 4;
  const norm = 1 / (2 * r + 1);
  for (let li = 0; li < lines; li++) {
    const base = li * lineStride;
    let sr = 0, sg = 0, sb = 0, sa = 0;
    // Prime the sliding window (edge-clamped)
    for (let i = -r; i <= r; i++) {
      const idx = base + Math.max(0, Math.min(len - 1, i)) * stride;
      sr += src[idx]; sg += src[idx + 1]; sb += src[idx + 2]; sa += src[idx + 3];
    }
    for (let i = 0; i < len; i++) {
      const o = base + i * stride;
      dst[o] = sr * norm; dst[o + 1] = sg * norm; dst[o + 2] = sb * norm; dst[o + 3] = sa * norm;
      const addI = base + Math.min(len - 1, i + r + 1) * stride;
      const subI = base + Math.max(0, i - r) * stride;
      sr += src[addI] - src[subI];
      sg += src[addI + 1] - src[subI + 1];
      sb += src[addI + 2] - src[subI + 2];
      sa += src[addI + 3] - src[subI + 3];
    }
  }
}

/** Clarity: adds back a high-pass of a large-radius blur (local contrast). */
export function clarityImageData(img: ImageData, amount: number): void {
  if (amount === 0) return;
  const a = (amount / 100) * 0.9;
  const blurred = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  boxBlurImageData(blurred, Math.max(3, Math.round(Math.min(img.width, img.height) / 40)), 1);
  const d = img.data;
  const bd = blurred.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (d[i] - bd[i]) * a;
    d[i + 1] = d[i + 1] + (d[i + 1] - bd[i + 1]) * a;
    d[i + 2] = d[i + 2] + (d[i + 2] - bd[i + 2]) * a;
  }
}

export function vignetteImageData(img: ImageData, amount: number): void {
  if (amount <= 0) return;
  const { width: w, height: h, data } = img;
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  const k = amount / 100;
  for (let y = 0; y < h; y++) {
    const dy = (y - cy) / maxD;
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / maxD;
      const d = Math.sqrt(dx * dx + dy * dy); // 0 center .. 1 corner
      // smoothstep between 0.45 and 1.05 → untouched center, darker corners
      const t = Math.max(0, Math.min(1, (d - 0.45) / 0.6));
      const f = 1 - k * t * t * (3 - 2 * t) * 0.85;
      if (f < 1) {
        const i = (y * w + x) * 4;
        data[i] *= f;
        data[i + 1] *= f;
        data[i + 2] *= f;
      }
    }
  }
}

/** Deterministic monochrome grain (mulberry32 PRNG — stable between renders). */
export function grainImageData(img: ImageData, amount: number, seed = 1234): void {
  if (amount <= 0) return;
  const d = img.data;
  const k = (amount / 100) * 46;
  let s = seed >>> 0;
  for (let i = 0; i < d.length; i += 4) {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const n = (((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5) * k;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
}

// --------------------------------------------------------------------------
// Histogram (luma + RGB), sampled with a stride to stay cheap on preview.
// --------------------------------------------------------------------------

export interface Histogram { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array; max: number }

export function computeHistogram(img: ImageData): Histogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 8) { // stride 2px
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
    luma[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
  }
  let max = 1;
  for (let i = 1; i < 255; i++) { // ignore extremes so clipped pixels don't flatten the plot
    if (luma[i] > max) max = luma[i];
    if (r[i] > max) max = r[i];
    if (g[i] > max) max = g[i];
    if (b[i] > max) max = b[i];
  }
  return { r, g, b, luma, max };
}

// --------------------------------------------------------------------------
// Render pipeline — geometry + LUTs + color pass + spatial FX + layers.
// --------------------------------------------------------------------------

/** Scale needed so a rect rotated by `rad` still covers its original bounds. */
function coverScaleForRotation(w: number, h: number, rad: number): number {
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

/** Draws `src` into a W×H context with fine rotation (zoom-to-fill) + flips. */
export function drawWithGeometry(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, geom: GeomState, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  const rad = (geom.angle * Math.PI) / 180;
  if (rad !== 0) ctx.rotate(rad);
  const cover = rad !== 0 ? coverScaleForRotation(W, H, rad) : 1; // zoom-to-fill: no empty corners while straightening
  const sx = (W / src.width) * cover * (geom.flipH ? -1 : 1);
  const sy = (H / src.height) * cover * (geom.flipV ? -1 : 1);
  ctx.scale(sx, sy);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  ctx.restore();
}

/**
 * Maps a point from geometry-rendered space (what the user sees/clicks) back
 * to base pixel coordinates. Used so brushes hit the right spot while a live
 * (un-baked) rotation/flip preview is active.
 */
export function inverseGeometryPoint(x: number, y: number, W: number, H: number, geom: GeomState): { x: number; y: number } {
  if (geom.angle === 0 && !geom.flipH && !geom.flipV) return { x, y };
  const rad = (geom.angle * Math.PI) / 180;
  const cover = rad !== 0 ? coverScaleForRotation(W, H, rad) : 1;
  const dx = x - W / 2;
  const dy = y - H / 2;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos + dy * sin; // inverse rotation
  const ry = -dx * sin + dy * cos;
  return {
    x: rx / (cover * (geom.flipH ? -1 : 1)) + W / 2, // inverse scale + flips
    y: ry / (cover * (geom.flipV ? -1 : 1)) + H / 2,
  };
}

export function applyParamsToImageData(img: ImageData, params: PhotoParams): ImageData {
  const eff = effectiveAdjustments(params.adj, params.filter);
  const def = params.filter.id ? FILTERS.find((f) => f.id === params.filter.id) : null;
  const k = params.filter.intensity / 100;

  // 1) tone LUTs (exposure/brightness/contrast/levels/curves/matte/temp/tint)
  const luts = buildChannelLUTs(eff, params.curves, params.levels, params.filter);
  if (!luts.identity) {
    const d = img.data;
    const lr = luts.r, lg = luts.g, lb = luts.b;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lr[d[i]];
      d[i + 1] = lg[d[i + 1]];
      d[i + 2] = lb[d[i + 2]];
    }
  }

  // 2) color pass (highlights/shadows, sat/vibrance, HSL, BW/sépia)
  applyColorPass(img, {
    highlights: eff.highlights,
    shadows: eff.shadows,
    saturation: eff.saturation,
    vibrance: eff.vibrance,
    hsl: params.hsl,
    bw: def?.recipe.bw ? k : 0,
    sepia: def?.recipe.sepia ? k : 0,
  });

  // 3) spatial FX — radii scale with resolution so preview ≈ export
  if (eff.clarity !== 0) clarityImageData(img, eff.clarity);
  if (eff.blur > 0) boxBlurImageData(img, Math.max(1, ((eff.blur / 100) * Math.min(img.width, img.height)) / 55), 2);
  let out = img;
  if (eff.sharpen > 0) out = sharpenImageData(out, eff.sharpen);
  if (eff.vignette > 0) vignetteImageData(out, eff.vignette);
  if (eff.grain > 0) grainImageData(out, eff.grain);
  return out;
}

/**
 * Full render: base pixels → geometry → pixel pipeline → element layers.
 * `dest` is resized to the base dimensions. This is the single entry point
 * used both by the live preview (downscaled base) and the export (full base).
 */
export function renderPhoto(
  base: HTMLCanvasElement,
  params: PhotoParams,
  dest: HTMLCanvasElement,
  opts?: { skipLayers?: boolean },
): void {
  const W = base.width;
  const H = base.height;
  if (dest.width !== W) dest.width = W;
  if (dest.height !== H) dest.height = H;
  const ctx = dest.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  drawWithGeometry(ctx, base, params.geom, W, H);

  const img = ctx.getImageData(0, 0, W, H);
  const out = applyParamsToImageData(img, params);
  ctx.putImageData(out, 0, 0);

  if (!opts?.skipLayers) {
    for (const layer of params.layers) {
      if (layer.visible) drawElementLayer(ctx, W, H, layer);
    }
  }
}

// --------------------------------------------------------------------------
// Element layer drawing (text reuses the capa viral styles).
// --------------------------------------------------------------------------

// Watermark bitmaps are decoded async; cache them so render stays sync.
const wmCache = new Map<string, HTMLImageElement>();
let wmInvalidate: (() => void) | null = null;
/** Stage registers a callback to re-render once a watermark image decodes. */
export function onWatermarkReady(cb: (() => void) | null): void {
  wmInvalidate = cb;
}

export function drawElementLayer(ctx: CanvasRenderingContext2D, W: number, H: number, layer: ElementLayer): void {
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  if (layer.kind === "texto") {
    drawCapaText(ctx, W, H, {
      id: layer.id, text: layer.text, x: layer.x, y: layer.y,
      size: layer.size, style: layer.style, color: layer.color, accent: layer.accent,
    });
  } else if (layer.kind === "emoji") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(layer.size * H)}px system-ui`;
    ctx.fillText(layer.emoji, layer.x * W, layer.y * H);
  } else if (layer.kind === "forma") {
    const w = layer.w * W;
    const h = layer.h * H;
    const x = layer.x * W - w / 2;
    const y = layer.y * H - h / 2;
    const lw = Math.max(1, layer.strokeWidth * Math.min(W, H));
    ctx.lineWidth = lw;
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    if (layer.shape === "retangulo") {
      if (layer.fill) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
    } else if (layer.shape === "circulo") {
      ctx.beginPath();
      ctx.ellipse(layer.x * W, layer.y * H, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (layer.fill) ctx.fill();
      else ctx.stroke();
    } else {
      // seta: shaft + head, pointing right, spanning the box
      const y0 = layer.y * H;
      const headL = Math.min(w * 0.35, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + w - headL * 0.6, y0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w, y0);
      ctx.lineTo(x + w - headL, y0 - h / 2);
      ctx.lineTo(x + w - headL, y0 + h / 2);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // marca d'água (logo do Kit de marca)
    let img = wmCache.get(layer.dataUrl);
    if (!img) {
      img = new Image();
      img.onload = () => wmInvalidate?.();
      img.src = layer.dataUrl;
      wmCache.set(layer.dataUrl, img);
    }
    if (img.complete && img.naturalWidth > 0) {
      const w = layer.size * W;
      const h = (w * img.naturalHeight) / img.naturalWidth;
      ctx.drawImage(img, layer.x * W - w / 2, layer.y * H - h / 2, w, h);
    }
  }
  ctx.restore();
}

// --------------------------------------------------------------------------
// Canvas utilities
// --------------------------------------------------------------------------

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

/**
 * Downscale to at most `maxPixels`, halving in steps (bicubic-ish quality:
 * repeated 2x drawImage reductions avoid the aliasing of a single big jump).
 */
export function downscaleToMax(src: HTMLCanvasElement | HTMLImageElement, maxPixels: number): HTMLCanvasElement {
  const sw = "naturalWidth" in src ? src.naturalWidth || src.width : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight || src.height : src.height;
  const scale = Math.min(1, Math.sqrt(maxPixels / Math.max(1, sw * sh)));
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));
  let cur: HTMLCanvasElement | HTMLImageElement = src;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const step = makeCanvas(Math.ceil(cw / 2), Math.ceil(ch / 2));
    step.getContext("2d")!.drawImage(cur, 0, 0, step.width, step.height);
    cur = step;
    cw = step.width;
    ch = step.height;
  }
  const out = makeCanvas(tw, th);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

// --------------------------------------------------------------------------
// Destructive geometry ops (return a NEW canvas)
// --------------------------------------------------------------------------

/** Bakes fine rotation (zoom-to-fill) + flips into the pixels; keeps dimensions. */
export function bakeGeometry(src: HTMLCanvasElement, geom: GeomState): HTMLCanvasElement {
  if (geom.angle === 0 && !geom.flipH && !geom.flipV) return src;
  const out = makeCanvas(src.width, src.height);
  drawWithGeometry(out.getContext("2d")!, src, geom, src.width, src.height);
  return out;
}

/** 90° rotation (dimensions swap). dir = 1 clockwise, -1 counter-clockwise. */
export function rotate90(src: HTMLCanvasElement, dir: 1 | -1): HTMLCanvasElement {
  const out = makeCanvas(src.height, src.width);
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export function cropCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const cx = Math.max(0, Math.min(src.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(src.height - 1, Math.round(y)));
  const cw = Math.max(1, Math.min(src.width - cx, Math.round(w)));
  const ch = Math.max(1, Math.min(src.height - cy, Math.round(h)));
  const out = makeCanvas(cw, ch);
  out.getContext("2d")!.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch);
  return out;
}

/** High-quality resize via stepped halving + final smooth draw. */
export function resizeCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const tw = Math.max(1, Math.round(w));
  const th = Math.max(1, Math.round(h));
  let cur: HTMLCanvasElement = src;
  while (cur.width / 2 >= tw && cur.height / 2 >= th) {
    const step = makeCanvas(Math.ceil(cur.width / 2), Math.ceil(cur.height / 2));
    step.getContext("2d")!.drawImage(cur, 0, 0, step.width, step.height);
    cur = step;
  }
  const out = makeCanvas(tw, th);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

/** Extends the canvas with a solid background color on each side. */
export function extendCanvas(
  src: HTMLCanvasElement,
  pad: { top: number; right: number; bottom: number; left: number },
  bg: string,
): HTMLCanvasElement {
  const out = makeCanvas(src.width + pad.left + pad.right, src.height + pad.top + pad.bottom);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, pad.left, pad.top);
  return out;
}

/**
 * Simple perspective/skew via strip drawing. `hAmount` tapers the top/bottom
 * edge widths (vertical perspective), `vAmount` the left/right heights
 * (horizontal perspective). -50..50. Strip-based drawing approximates a
 * projective warp well enough for straightening façades.
 */
export function perspectiveCanvas(src: HTMLCanvasElement, hAmount: number, vAmount: number): HTMLCanvasElement {
  let cur = src;
  if (hAmount !== 0) {
    const out = makeCanvas(cur.width, cur.height);
    const ctx = out.getContext("2d")!;
    const k = hAmount / 100; // >0: top narrower
    for (let y = 0; y < cur.height; y++) {
      const t = y / Math.max(1, cur.height - 1);
      const scale = 1 - k * (1 - t) * 0.6;
      const w = cur.width * scale;
      ctx.drawImage(cur, 0, y, cur.width, 1, (cur.width - w) / 2, y, w, 1);
    }
    cur = out;
  }
  if (vAmount !== 0) {
    const out = makeCanvas(cur.width, cur.height);
    const ctx = out.getContext("2d")!;
    const k = vAmount / 100; // >0: left shorter
    for (let x = 0; x < cur.width; x++) {
      const t = x / Math.max(1, cur.width - 1);
      const scale = 1 - k * (1 - t) * 0.6;
      const h = cur.height * scale;
      ctx.drawImage(cur, x, 0, 1, cur.height, x, (cur.height - h) / 2, 1, h);
    }
    cur = out;
  }
  return cur === src ? cloneCanvas(src) : cur;
}

// --------------------------------------------------------------------------
// Local (brush/click) retouch operations. All operate on a small patch around
// the stamp — cost is O(brush area), independent of image size.
// --------------------------------------------------------------------------

interface Patch { img: ImageData; x0: number; y0: number; w: number; h: number }

function getPatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): Patch | null {
  const c = ctx.canvas;
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(c.width, Math.ceil(cx + r));
  const y1 = Math.min(c.height, Math.ceil(cy + r));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return null;
  return { img: ctx.getImageData(x0, y0, w, h), x0, y0, w, h };
}

/** Soft radial falloff: 1 at the center → 0 at the brush edge. */
function falloff(dx: number, dy: number, r: number): number {
  const d = Math.sqrt(dx * dx + dy * dy) / r;
  if (d >= 1) return 0;
  const t = 1 - d;
  return t * t * (3 - 2 * t); // smoothstep
}

export type DodgeBurnMode = "dodge" | "burn" | "dentes" | "olhos";

/**
 * Dodge/burn brush. Presets: "dentes" = dodge + remove yellow cast (teeth
 * whitening), "olhos" = dodge + slight saturation boost (eye brightening).
 */
export function dodgeBurnStamp(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, strength: number, mode: DodgeBurnMode,
): void {
  const p = getPatch(ctx, cx, cy, r);
  if (!p) return;
  const d = p.img.data;
  const s = (strength / 100) * 0.55;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const f = falloff(p.x0 + x - cx, p.y0 + y - cy, r) * s;
      if (f <= 0) continue;
      const i = (y * p.w + x) * 4;
      let rr = d[i], gg = d[i + 1], bb = d[i + 2];
      if (mode === "burn") {
        rr -= rr * f * 0.6; gg -= gg * f * 0.6; bb -= bb * f * 0.6;
      } else {
        // dodge, scaled by headroom so highlights don't clip harshly
        rr += (255 - rr) * f * 0.7; gg += (255 - gg) * f * 0.7; bb += (255 - bb) * f * 0.7;
        if (mode === "dentes") {
          // pull the yellow cast (r+g above b) toward neutral
          const yellow = Math.max(0, (rr + gg) / 2 - bb);
          rr -= yellow * f * 0.8;
          gg -= yellow * f * 0.5;
          bb += yellow * f * 0.4;
        } else if (mode === "olhos") {
          const luma = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
          const boost = 1 + f * 0.35;
          rr = luma + (rr - luma) * boost;
          gg = luma + (gg - luma) * boost;
          bb = luma + (bb - luma) * boost;
        }
      }
      d[i] = rr; d[i + 1] = gg; d[i + 2] = bb;
    }
  }
  ctx.putImageData(p.img, p.x0, p.y0);
}

export function blurStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, strength: number): void {
  const p = getPatch(ctx, cx, cy, r);
  if (!p) return;
  const blurred = new ImageData(new Uint8ClampedArray(p.img.data), p.w, p.h);
  boxBlurImageData(blurred, Math.max(1, r / 7), 2);
  mixPatch(ctx, p, blurred.data, cx, cy, r, strength / 100);
}

export function sharpenStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, strength: number): void {
  const p = getPatch(ctx, cx, cy, r);
  if (!p) return;
  const sharp = sharpenImageData(p.img, 70);
  mixPatch(ctx, p, sharp.data, cx, cy, r, strength / 100);
}

/** Blends `srcData` into the patch with radial feather × strength. */
function mixPatch(ctx: CanvasRenderingContext2D, p: Patch, srcData: Uint8ClampedArray, cx: number, cy: number, r: number, strength: number): void {
  const d = p.img.data;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const f = falloff(p.x0 + x - cx, p.y0 + y - cy, r) * strength;
      if (f <= 0) continue;
      const i = (y * p.w + x) * 4;
      d[i] += (srcData[i] - d[i]) * f;
      d[i + 1] += (srcData[i + 1] - d[i + 1]) * f;
      d[i + 2] += (srcData[i + 2] - d[i + 2]) * f;
      d[i + 3] += (srcData[i + 3] - d[i + 3]) * f;
    }
  }
  ctx.putImageData(p.img, p.x0, p.y0);
}

/** Clone stamp: copies pixels from (cx-offX, cy-offY) onto (cx, cy). */
export function cloneStamp(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, offX: number, offY: number, strength: number,
): void {
  const dst = getPatch(ctx, cx, cy, r);
  if (!dst) return;
  const c = ctx.canvas;
  const src = ctx.getImageData(
    Math.max(0, Math.min(c.width - dst.w, dst.x0 - offX)),
    Math.max(0, Math.min(c.height - dst.h, dst.y0 - offY)),
    dst.w, dst.h,
  );
  mixPatch(ctx, dst, src.data, cx, cy, r, strength / 100);
}

/** Background eraser: pixels close to `key` lose alpha (chroma-key → alpha). */
export function eraseColorStamp(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, key: Rgb, tolerance: number, strength: number,
): void {
  const p = getPatch(ctx, cx, cy, r);
  if (!p) return;
  const d = p.img.data;
  const hard = (tolerance / 100) * 220; // same scale as canvas-fx keyColorFromImageData
  const feather = hard * 0.5 + 24;
  const s = strength / 100;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const f = falloff(p.x0 + x - cx, p.y0 + y - cy, r) * s;
      if (f <= 0) continue;
      const i = (y * p.w + x) * 4;
      const dr = d[i] - key.r;
      const dg = d[i + 1] - key.g;
      const db = d[i + 2] - key.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      let match = 0;
      if (dist <= hard) match = 1;
      else if (dist <= hard + feather) match = 1 - (dist - hard) / feather;
      if (match > 0) d[i + 3] *= 1 - match * f;
    }
  }
  ctx.putImageData(p.img, p.x0, p.y0);
}

/** Red-eye fix: inside the circle, strongly red pixels collapse to their G/B mean. */
export function redEyeStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const p = getPatch(ctx, cx, cy, r);
  if (!p) return;
  const d = p.img.data;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const f = falloff(p.x0 + x - cx, p.y0 + y - cy, r * 0.98);
      if (f <= 0) continue;
      const i = (y * p.w + x) * 4;
      const gb = (d[i + 1] + d[i + 2]) / 2;
      if (d[i] > gb * 1.35 && d[i] > 55) {
        const target = gb * 0.85;
        d[i] += (target - d[i]) * Math.min(1, f * 1.6);
      }
    }
  }
  ctx.putImageData(p.img, p.x0, p.y0);
}

/**
 * Spot heal: diffusion inpainting. The patch is downscaled, the interior of
 * the spot is filled by Jacobi iterations from the border (a cheap Poisson
 * solve), upscaled back and blended in with a radial feather. Removes pimples,
 * dust and small objects with smooth, texture-free fill.
 */
export function spotHealStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const R = r * 1.6;
  const p = getPatch(ctx, cx, cy, R);
  if (!p) return;
  // 1) downscale patch to ≤48px on the longest side
  const scale = Math.min(1, 48 / Math.max(p.w, p.h));
  const sw = Math.max(4, Math.round(p.w * scale));
  const sh = Math.max(4, Math.round(p.h * scale));
  const tmp = makeCanvas(p.w, p.h);
  tmp.getContext("2d")!.putImageData(p.img, 0, 0);
  const small = makeCanvas(sw, sh);
  const sctx = small.getContext("2d")!;
  sctx.drawImage(tmp, 0, 0, sw, sh);
  const simg = sctx.getImageData(0, 0, sw, sh);
  const sd = simg.data;
  // 2) Jacobi diffusion: interior pixels (inside the spot) relax to the mean
  //    of their 4 neighbours; the border stays fixed → smooth in-fill.
  const scx = (cx - p.x0) * scale;
  const scy = (cy - p.y0) * scale;
  const sr = r * scale;
  const interior: number[] = [];
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const dx = x - scx;
      const dy = y - scy;
      if (dx * dx + dy * dy <= sr * sr) interior.push((y * sw + x) * 4);
    }
  }
  const buf = new Float32Array(sd.length);
  for (let i = 0; i < sd.length; i++) buf[i] = sd[i];
  for (let it = 0; it < 50; it++) {
    for (const i of interior) {
      for (let c = 0; c < 3; c++) {
        buf[i + c] = (buf[i + c - 4] + buf[i + c + 4] + buf[i + c - sw * 4] + buf[i + c + sw * 4]) / 4;
      }
    }
  }
  for (const i of interior) {
    sd[i] = buf[i]; sd[i + 1] = buf[i + 1]; sd[i + 2] = buf[i + 2];
  }
  sctx.putImageData(simg, 0, 0);
  // 3) upscale healed patch and feather-blend into the original
  const up = makeCanvas(p.w, p.h);
  const uctx = up.getContext("2d")!;
  uctx.imageSmoothingQuality = "high";
  uctx.drawImage(small, 0, 0, p.w, p.h);
  const healed = uctx.getImageData(0, 0, p.w, p.h).data;
  mixPatch(ctx, p, healed, cx, cy, r * 1.15, 1);
}

export type LiquifyMode = "empurrar" | "expandir" | "encolher" | "restaurar";

/**
 * Basic liquify: backward-mapped radial warp. "empurrar" drags pixels along
 * the pointer delta, "expandir"/"encolher" bloat/pinch around the center.
 */
export function liquifyStamp(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
  dx: number, dy: number, mode: LiquifyMode, strength: number,
): void {
  const p = getPatch(ctx, cx, cy, r);
  if (!p) return;
  const src = new Uint8ClampedArray(p.img.data); // frozen copy for sampling
  const d = p.img.data;
  const s = strength / 100;
  const lcx = cx - p.x0;
  const lcy = cy - p.y0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const f = falloff(x - lcx, y - lcy, r);
      if (f <= 0) continue;
      let sx = x;
      let sy = y;
      if (mode === "empurrar") {
        sx = x - dx * f * s;
        sy = y - dy * f * s;
      } else {
        const vx = x - lcx;
        const vy = y - lcy;
        const k = mode === "expandir" ? 1 - 0.5 * s * f : 1 + 0.6 * s * f;
        sx = lcx + vx * k;
        sy = lcy + vy * k;
      }
      // bilinear sample from the frozen copy (clamped)
      sx = Math.max(0, Math.min(p.w - 1.001, sx));
      sy = Math.max(0, Math.min(p.h - 1.001, sy));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * p.w + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + p.w * 4;
      const i11 = i01 + 4;
      const o = (y * p.w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        d[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  ctx.putImageData(p.img, p.x0, p.y0);
}

/** Paints a soft white stamp into the skin-smoothing mask canvas. */
export function paintMaskStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, erase: boolean): void {
  ctx.save();
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * "Suavizar pele": edge-preserving selective blur through the painted mask.
 * out = mix(orig, blur, maskAlpha × amount × edgeProtect) — pixels near strong
 * edges (big |orig−blur| luma delta) keep detail, flat skin areas smooth out.
 * Full-image op — run behind a busy state at full resolution ("Aplicar").
 */
export function applySkinSmooth(base: HTMLCanvasElement, mask: HTMLCanvasElement, amount: number): void {
  const ctx = base.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, base.width, base.height);
  const blurred = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  boxBlurImageData(blurred, Math.max(2, Math.round(Math.min(base.width, base.height) / 160) + 2), 2);
  // mask alpha at base resolution
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  const mimg = mctx.getImageData(0, 0, mask.width, mask.height);
  const d = img.data;
  const bd = blurred.data;
  const md = mimg.data;
  const a = amount / 100;
  for (let i = 0; i < d.length; i += 4) {
    const m = md[i + 3] / 255;
    if (m <= 0) continue;
    const dl = Math.abs(
      0.2126 * (d[i] - bd[i]) + 0.7152 * (d[i + 1] - bd[i + 1]) + 0.0722 * (d[i + 2] - bd[i + 2]),
    );
    const edgeProtect = Math.max(0, 1 - dl / 42); // keep eyes/lips/hair edges
    const f = m * a * edgeProtect;
    if (f <= 0) continue;
    d[i] += (bd[i] - d[i]) * f;
    d[i + 1] += (bd[i + 1] - d[i + 1]) * f;
    d[i + 2] += (bd[i + 2] - d[i + 2]) * f;
  }
  ctx.putImageData(img, 0, 0);
}

// --------------------------------------------------------------------------
// Sample image — a colorful synthetic scene (sky/sun/mountains/field/person)
// with a wide hue range, so every tool has something to bite into.
// --------------------------------------------------------------------------

export function makeSampleImage(): HTMLCanvasElement {
  const W = 1600;
  const H = 1066;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, "#1e3a8a");
  sky.addColorStop(0.55, "#3b82f6");
  sky.addColorStop(1, "#fda4af");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.62);
  // sun + glow
  const sun = ctx.createRadialGradient(W * 0.72, H * 0.34, 10, W * 0.72, H * 0.34, 190);
  sun.addColorStop(0, "#fef3c7");
  sun.addColorStop(0.25, "#fbbf24");
  sun.addColorStop(1, "rgba(251,146,60,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H * 0.62);
  // clouds
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (const [cx, cy, cr] of [[300, 190, 55], [390, 205, 70], [480, 185, 50], [1120, 130, 45], [1190, 145, 60]] as const) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, cr * 1.6, cr * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // mountains
  ctx.fillStyle = "#6d28d9";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  ctx.lineTo(W * 0.2, H * 0.34);
  ctx.lineTo(W * 0.42, H * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7c3aed";
  ctx.beginPath();
  ctx.moveTo(W * 0.3, H * 0.62);
  ctx.lineTo(W * 0.55, H * 0.28);
  ctx.lineTo(W * 0.82, H * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f5f3ff";
  ctx.beginPath();
  ctx.moveTo(W * 0.49, H * 0.375);
  ctx.lineTo(W * 0.55, H * 0.28);
  ctx.lineTo(W * 0.615, H * 0.375);
  ctx.quadraticCurveTo(W * 0.55, H * 0.42, W * 0.49, H * 0.375);
  ctx.closePath();
  ctx.fill();
  // field
  const field = ctx.createLinearGradient(0, H * 0.6, 0, H);
  field.addColorStop(0, "#16a34a");
  field.addColorStop(1, "#14532d");
  ctx.fillStyle = field;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  // river
  ctx.fillStyle = "#0ea5e9";
  ctx.beginPath();
  ctx.moveTo(W * 0.86, H * 0.6);
  ctx.quadraticCurveTo(W * 0.7, H * 0.78, W * 0.92, H);
  ctx.lineTo(W * 1.05, H);
  ctx.quadraticCurveTo(W * 0.88, H * 0.76, W * 0.97, H * 0.6);
  ctx.closePath();
  ctx.fill();
  // flowers (red/magenta/yellow dots) — deterministic PRNG
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const flowerColors = ["#ef4444", "#d946ef", "#facc15", "#fb923c"];
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = flowerColors[i % flowerColors.length];
    ctx.beginPath();
    ctx.arc(rnd() * W, H * (0.66 + rnd() * 0.32), 4 + rnd() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // person (face with cheeks + eyes for the retouch tools)
  const px = W * 0.24;
  const py = H * 0.74;
  ctx.fillStyle = "#0f766e"; // body
  ctx.beginPath();
  ctx.moveTo(px - 105, H);
  ctx.quadraticCurveTo(px, py + 30, px + 105, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8b48c"; // head
  ctx.beginPath();
  ctx.arc(px, py - 65, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5b3a29"; // hair
  ctx.beginPath();
  ctx.arc(px, py - 92, 86, Math.PI, 0);
  ctx.fill();
  // rosy cheeks (skin-smoothing target)
  ctx.fillStyle = "rgba(239,68,68,0.28)";
  ctx.beginPath();
  ctx.ellipse(px - 44, py - 44, 17, 11, 0, 0, Math.PI * 2);
  ctx.ellipse(px + 44, py - 44, 17, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // small blemishes (spot-heal targets)
  ctx.fillStyle = "#a16207";
  for (const [bx, by] of [[px - 20, py - 70], [px + 30, py - 30], [px + 8, py - 12]] as const) {
    ctx.beginPath();
    ctx.arc(bx, by, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // eyes with red pupils (red-eye targets)
  for (const ex of [px - 30, px + 30]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(ex, py - 72, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(ex, py - 72, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // mouth
  ctx.strokeStyle = "#9f1239";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(px, py - 36, 24, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  return c;
}

// --------------------------------------------------------------------------
// Auto-melhoria (1 clique) e ampliação — funções puras/testáveis.
// --------------------------------------------------------------------------

interface PixelSource {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Deriva ajustes automáticos a partir dos pixels: alonga o contraste pelos
 * percentis (evita clipar ruído), equilibra o branco pelo "mundo cinza" e dá
 * um leve toque de vibração/nitidez. Retorna um patch para mesclar em
 * `params.adjustments`. Puro — não toca em canvas.
 */
export function autoEnhanceAdjustments(img: PixelSource): Partial<Adjustments> {
  const d = img.data;
  const luma = new Uint32Array(256);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    // stride 4px para velocidade
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    luma[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++;
    sumR += r;
    sumG += g;
    sumB += b;
    n++;
  }
  if (n === 0) return {};

  const total = n;
  const pct = (p: number): number => {
    const target = total * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += luma[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  const lo = pct(0.005);
  const hi = pct(0.995);
  const range = Math.max(1, hi - lo);

  // contraste: quanto mais comprimido o histograma, mais alongamos (cap +45)
  const contrast = clampAdj(Math.round(((255 - range) / 255) * 70));
  // brilho: centraliza o meio-tom em ~118 (leve preferência por imagem clara)
  const mid = (lo + hi) / 2;
  const brightness = clampAdj(Math.round((118 - mid) * 0.55));

  // balanço de branco pelo mundo cinza
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  const meanRGB = (meanR + meanG + meanB) / 3;
  // temperatura: se a imagem puxa azul (meanB alto), esquenta (+); se puxa vermelho, esfria (−)
  const temperature = clampAdj(Math.round(((meanB - meanR) / Math.max(1, meanRGB)) * 60));
  const tint = clampAdj(Math.round((((meanR + meanB) / 2 - meanG) / Math.max(1, meanRGB)) * 60));

  return {
    contrast,
    brightness,
    temperature,
    tint,
    vibrance: 16,
    clarity: 8,
  };
}

function clampAdj(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

/**
 * Amplia um canvas por `factor` (ex.: 2) com reamostragem de alta qualidade do
 * navegador, em passos de 2× (melhor que um único salto). Limita o total de
 * pixels de saída para não estourar memória.
 */
export function upscaleCanvas(src: HTMLCanvasElement, factor: number, maxOutPixels = 40_000_000): HTMLCanvasElement {
  const f = Math.max(1, Math.min(4, factor));
  let targetW = Math.round(src.width * f);
  let targetH = Math.round(src.height * f);
  if (targetW * targetH > maxOutPixels) {
    const s = Math.sqrt(maxOutPixels / (targetW * targetH));
    targetW = Math.max(1, Math.round(targetW * s));
    targetH = Math.max(1, Math.round(targetH * s));
  }
  let cur: HTMLCanvasElement = src;
  // dobra progressivamente enquanto ainda falta pelo menos 2×
  while (cur.width * 2 <= targetW && cur.height * 2 <= targetH) {
    const step = makeCanvas(cur.width * 2, cur.height * 2);
    const sctx = step.getContext("2d")!;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(cur, 0, 0, step.width, step.height);
    cur = step;
  }
  if (cur.width === targetW && cur.height === targetH) return cur;
  const out = makeCanvas(targetW, targetH);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, targetW, targetH);
  return out;
}

/**
 * Desfoca o FUNDO mantendo o assunto (assumido no centro) nítido, com borda
 * suave (feather). Não é segmentação por IA — é um desfoque radial: cobre bem
 * retratos com o rosto/corpo centralizado. `strength` 0..100 controla o raio.
 */
export function backgroundBlurCanvas(src: HTMLCanvasElement, strength = 60): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext("2d");
  if (!sctx) return src;

  // 1) versão borrada da imagem inteira
  const radius = Math.max(4, Math.round((Math.min(w, h) / 22) * (strength / 100 + 0.4)));
  const img = sctx.getImageData(0, 0, w, h);
  const blurred = new ImageData(new Uint8ClampedArray(img.data), w, h);
  boxBlurImageData(blurred, radius, 2);

  const out = makeCanvas(w, h);
  const octx = out.getContext("2d")!;
  octx.putImageData(blurred, 0, 0);

  // 2) recorte nítido do assunto (elipse central com feather) por cima
  const sharp = makeCanvas(w, h);
  const spx = sharp.getContext("2d")!;
  spx.putImageData(img, 0, 0);
  const cx = w / 2;
  const cy = h * 0.46; // assunto tende a ficar um pouco acima do centro
  const rx = w * 0.42;
  const ry = h * 0.52;
  spx.globalCompositeOperation = "destination-in";
  spx.save();
  spx.translate(cx, cy);
  spx.scale(rx, ry);
  const grad = spx.createRadialGradient(0, 0, 0.55, 0, 0, 1);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(0.7, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  spx.fillStyle = grad;
  spx.beginPath();
  spx.arc(0, 0, 1, 0, Math.PI * 2);
  spx.fill();
  spx.restore();

  octx.drawImage(sharp, 0, 0);
  return out;
}

/**
 * Peso 0..1 de "isto parece pele" a partir de RGB (via YCbCr). Suave nas
 * bordas da faixa para transição gradual. Puro/testável.
 */
export function skinWeight(r: number, g: number, b: number): number {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (y < 40 || y > 245) return 0; // sombra dura / estouro
  // faixas típicas de pele em Cb/Cr, com rampa suave de ±12
  const inRange = (v: number, lo: number, hi: number): number => {
    if (v < lo - 12 || v > hi + 12) return 0;
    if (v >= lo && v <= hi) return 1;
    return v < lo ? (v - (lo - 12)) / 12 : ((hi + 12) - v) / 12;
  };
  const wCb = inRange(cb, 77, 127);
  const wCr = inRange(cr, 133, 173);
  return Math.max(0, Math.min(1, wCb * wCr));
}

/**
 * Retoque de retrato em 1 clique: suaviza a textura da PELE (seleção por tom)
 * preservando bordas fortes (olhos, sobrancelhas, contornos) via guia de
 * diferença. `strength` 0..100. Não usa detecção de rosto — funciona no rosto
 * e em qualquer área de tom de pele. Devolve um novo canvas.
 */
export function portraitRetouch(src: HTMLCanvasElement, strength = 70): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext("2d");
  if (!sctx) return src;
  const img = sctx.getImageData(0, 0, w, h);
  const orig = img.data;

  const blurred = new ImageData(new Uint8ClampedArray(orig), w, h);
  boxBlurImageData(blurred, Math.max(2, Math.round(Math.min(w, h) / 90)), 2);
  const bd = blurred.data;

  const s01 = Math.max(0, Math.min(1, strength / 100));
  for (let i = 0; i < orig.length; i += 4) {
    const r = orig[i];
    const g = orig[i + 1];
    const b = orig[i + 2];
    const skin = skinWeight(r, g, b);
    if (skin <= 0) continue;
    const lo = 0.299 * r + 0.587 * g + 0.114 * b;
    const lb = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
    // bordas fortes (grande diferença) preservam o original; textura fina é suavizada
    const edgeKeep = Math.max(0, 1 - Math.abs(lo - lb) / 42);
    const alpha = skin * edgeKeep * s01 * 0.85;
    if (alpha <= 0) continue;
    orig[i] = Math.round(r + (bd[i] - r) * alpha);
    orig[i + 1] = Math.round(g + (bd[i + 1] - g) * alpha);
    orig[i + 2] = Math.round(b + (bd[i + 2] - b) * alpha);
  }

  const out = makeCanvas(w, h);
  out.getContext("2d")!.putImageData(img, 0, 0);
  return out;
}

/**
 * Pincel RESTAURAR: pinta de volta os pixels do ORIGINAL (com borda suave).
 * Exige que o original tenha as mesmas dimensões da base atual (sem crop/resize
 * no meio) — o chamador valida.
 */
export function restoreStamp(
  ctx: CanvasRenderingContext2D,
  original: HTMLCanvasElement,
  cx: number,
  cy: number,
  r: number,
  strength: number,
): void {
  const size = Math.ceil(r * 2);
  const tmp = makeCanvas(size, size);
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(original, cx - r, cy - r, size, size, 0, 0, size, size);
  // máscara radial suave com alpha proporcional à força
  tctx.globalCompositeOperation = "destination-in";
  const grad = tctx.createRadialGradient(r, r, 0, r, r, r);
  const a = Math.max(0.05, Math.min(1, strength / 100));
  grad.addColorStop(0, `rgba(0,0,0,${a})`);
  grad.addColorStop(0.7, `rgba(0,0,0,${(a * 0.7).toFixed(3)})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, size, size);
  ctx.drawImage(tmp, cx - r, cy - r);
}

// --------------------------------------------------------------------------
// ILUMINAÇÃO (Luz) — presets de relighting SIMULADO por gradientes + filtro de
// cor (não é relighting por IA; honesto e 100% no navegador).
// --------------------------------------------------------------------------

export interface LightingPreset {
  id: string;
  name: string;
  css: string; // ctx.filter
  /** brilhos radiais (screen): posição 0..1, cor "r,g,b", alpha, raio (fração do maior lado). */
  spots: { x: number; y: number; color: string; alpha: number; r: number }[];
  vignette: number; // 0..1
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: "hora-dourada",
    name: "Hora Dourada",
    css: "sepia(0.22) saturate(1.25) brightness(1.06) contrast(1.04)",
    spots: [{ x: 0.15, y: 0.08, color: "255,170,60", alpha: 0.35, r: 0.95 }],
    vignette: 0.25,
  },
  {
    id: "manha",
    name: "Manhã",
    css: "brightness(1.1) saturate(1.06) contrast(0.98)",
    spots: [{ x: 0.5, y: 0, color: "255,240,220", alpha: 0.28, r: 0.9 }],
    vignette: 0.08,
  },
  {
    id: "drama",
    name: "Drama",
    css: "contrast(1.28) brightness(0.9) saturate(0.92)",
    spots: [{ x: 0.78, y: 0.18, color: "255,200,140", alpha: 0.24, r: 0.7 }],
    vignette: 0.5,
  },
  {
    id: "meio-dia",
    name: "Meio-dia Natural",
    css: "brightness(1.07) contrast(1.08) saturate(1.12)",
    spots: [{ x: 0.5, y: -0.1, color: "220,235,255", alpha: 0.18, r: 1.0 }],
    vignette: 0.1,
  },
  {
    id: "entardecer",
    name: "Entardecer",
    css: "sepia(0.3) saturate(1.15) brightness(0.98) hue-rotate(-8deg)",
    spots: [{ x: 0.85, y: 0.85, color: "255,110,80", alpha: 0.3, r: 0.9 }],
    vignette: 0.35,
  },
  {
    id: "neon-noite",
    name: "Noite Neon",
    css: "brightness(0.92) contrast(1.15) saturate(1.3)",
    spots: [
      { x: 0.08, y: 0.3, color: "120,80,255", alpha: 0.3, r: 0.8 },
      { x: 0.92, y: 0.7, color: "255,60,160", alpha: 0.3, r: 0.8 },
    ],
    vignette: 0.4,
  },
];

/** Aplica um preset de iluminação (destrutivo, com undo) e devolve novo canvas. */
export function applyLightingCanvas(src: HTMLCanvasElement, presetId: string): HTMLCanvasElement {
  const preset = LIGHTING_PRESETS.find((p) => p.id === presetId);
  if (!preset) return src;
  const w = src.width;
  const h = src.height;
  const out = makeCanvas(w, h);
  const ctx = out.getContext("2d")!;
  ctx.filter = preset.css;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";

  // brilhos (screen)
  ctx.globalCompositeOperation = "screen";
  for (const spot of preset.spots) {
    const r = Math.max(w, h) * spot.r;
    const grad = ctx.createRadialGradient(spot.x * w, spot.y * h, 0, spot.x * w, spot.y * h, r);
    grad.addColorStop(0, `rgba(${spot.color},${spot.alpha})`);
    grad.addColorStop(1, `rgba(${spot.color},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // vinheta
  if (preset.vignette > 0) {
    ctx.globalCompositeOperation = "source-over";
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${(0.75 * preset.vignette).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  return out;
}
