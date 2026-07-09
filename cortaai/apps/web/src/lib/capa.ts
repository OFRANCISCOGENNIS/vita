// Estúdio de Capa — canvas cover/thumbnail compositor. Pure rendering helpers
// used by the capa studio: draws a base scene (or uploaded image), applies
// color adjustments + background removal (chroma) + sharpen, then composites
// viral-style text and stickers. Everything is canvas-based and export-safe.

import { hexToRgb, keyColorFromImageData, sharpenImageData } from "./canvas-fx";

export type CapaRatio = "9:16" | "1:1" | "16:9" | "4:5";

export const CAPA_RATIOS: { id: CapaRatio; label: string; w: number; h: number }[] = [
  { id: "9:16", label: "9:16 · Stories/Reels", w: 1080, h: 1920 },
  { id: "1:1", label: "1:1 · Feed", w: 1080, h: 1080 },
  { id: "16:9", label: "16:9 · YouTube", w: 1280, h: 720 },
  { id: "4:5", label: "4:5 · Feed alto", w: 1080, h: 1350 },
];

export type CapaTextStyle = "impacto" | "neon" | "destaque" | "gradiente" | "contorno";

export const CAPA_TEXT_STYLES: { id: CapaTextStyle; label: string }[] = [
  { id: "impacto", label: "Impacto" },
  { id: "contorno", label: "Contorno" },
  { id: "neon", label: "Neon/Glow" },
  { id: "destaque", label: "Destaque" },
  { id: "gradiente", label: "Gradiente" },
];

export interface CapaText {
  id: string;
  text: string;
  x: number; // 0..1 center
  y: number;
  size: number; // fraction of canvas height (0.04..0.2)
  style: CapaTextStyle;
  color: string;
  accent: string; // secondary (highlight/stroke) color
}

export interface CapaSticker {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number; // fraction of height
}

export interface CapaState {
  ratio: CapaRatio;
  brightness: number; // -100..100
  contrast: number;
  saturation: number;
  bgKeyColor: string;
  bgRemoval: boolean;
  bgTolerance: number; // 0..100
  bgSoftness: number; // 0..100
  sharpen: number; // 0..100
  texts: CapaText[];
  stickers: CapaSticker[];
}

export function defaultCapaState(): CapaState {
  return {
    ratio: "9:16",
    brightness: 6,
    contrast: 10,
    saturation: 12,
    bgKeyColor: "#158a5a",
    bgRemoval: false,
    bgTolerance: 46,
    bgSoftness: 22,
    sharpen: 0,
    texts: [],
    stickers: [],
  };
}

function adjustFilter(s: CapaState): string {
  return `brightness(${(1 + s.brightness / 140).toFixed(3)}) contrast(${(1 + s.contrast / 130).toFixed(3)}) saturate(${Math.max(0, 1 + s.saturation / 100).toFixed(3)})`;
}

/** Draws the synthetic base "photo": a subject over a solid backdrop (bgKeyColor). */
function drawBaseScene(ctx: CanvasRenderingContext2D, W: number, H: number, backdrop: string) {
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, W, H);
  // soft floor gradient
  const floor = ctx.createLinearGradient(0, H * 0.6, 0, H);
  floor.addColorStop(0, "rgba(0,0,0,0)");
  floor.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, W, H);
  // subject
  const cx = W / 2;
  const headR = W * 0.13;
  ctx.fillStyle = "#2b3a67";
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.26, H);
  ctx.quadraticCurveTo(cx, H * 0.5, cx + W * 0.26, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8b48c";
  ctx.beginPath();
  ctx.arc(cx, H * 0.44, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a22";
  ctx.beginPath();
  ctx.arc(cx, H * 0.4, headR * 1.04, Math.PI, 0);
  ctx.fill();
}

function drawReplacementBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#3b1d6e");
  g.addColorStop(1, "#7a1e5c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Full composite render. Draws into `ctx` at logical size W×H. When `base` is
 * provided it is used as the photo (cover-fit); otherwise a synthetic scene is
 * drawn so background removal has a solid color to key out.
 */
export function renderCapa(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: CapaState,
  base: HTMLImageElement | null,
) {
  ctx.clearRect(0, 0, W, H);

  // 1) source (with color adjustments) on an offscreen canvas
  const src = document.createElement("canvas");
  src.width = W;
  src.height = H;
  const sctx = src.getContext("2d")!;
  sctx.filter = adjustFilter(state);
  if (base) {
    drawImageCover(sctx, base, W, H);
  } else {
    drawBaseScene(sctx, W, H, state.bgKeyColor);
  }
  sctx.filter = "none";

  // 2) background removal (chroma) or straight copy
  if (state.bgRemoval) {
    drawReplacementBackdrop(ctx, W, H);
    const img = sctx.getImageData(0, 0, W, H);
    keyColorFromImageData(img, hexToRgb(state.bgKeyColor), state.bgTolerance, state.bgSoftness);
    const fg = document.createElement("canvas");
    fg.width = W;
    fg.height = H;
    fg.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(fg, 0, 0);
  } else {
    ctx.drawImage(src, 0, 0);
  }

  // 3) sharpen (unsharp mask over the composed photo, before text)
  if (state.sharpen > 0) {
    const img = ctx.getImageData(0, 0, W, H);
    const sharp = sharpenImageData(img, state.sharpen);
    ctx.putImageData(sharp, 0, 0);
  }

  // 4) text layers
  for (const t of state.texts) drawText(ctx, W, H, t);

  // 5) stickers
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of state.stickers) {
    ctx.font = `${Math.round(s.size * H)}px system-ui`;
    ctx.fillText(s.emoji, s.x * W, s.y * H);
  }
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const ir = img.width / img.height;
  const cr = W / H;
  let dw = W;
  let dh = H;
  let dx = 0;
  let dy = 0;
  if (ir > cr) {
    dh = H;
    dw = H * ir;
    dx = (W - dw) / 2;
  } else {
    dw = W;
    dh = W / ir;
    dy = (H - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Viral-style text renderer — shared with the Editor de Fotos text layers. */
export function drawCapaText(ctx: CanvasRenderingContext2D, W: number, H: number, t: CapaText) {
  drawText(ctx, W, H, t);
}

function drawText(ctx: CanvasRenderingContext2D, W: number, H: number, t: CapaText) {
  const fontPx = Math.round(t.size * H);
  const text = t.style === "impacto" ? t.text.toUpperCase() : t.text;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontPx}px Inter, system-ui, sans-serif`;
  const x = t.x * W;
  const y = t.y * H;

  if (t.style === "destaque") {
    const w = ctx.measureText(text).width;
    const padX = fontPx * 0.28;
    const padY = fontPx * 0.18;
    ctx.fillStyle = t.accent;
    roundRect(ctx, x - w / 2 - padX, y - fontPx / 2 - padY, w + padX * 2, fontPx + padY * 2, fontPx * 0.16);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.fillText(text, x, y);
  } else if (t.style === "neon") {
    ctx.shadowColor = t.color;
    ctx.shadowBlur = fontPx * 0.55;
    ctx.fillStyle = t.color;
    ctx.fillText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  } else if (t.style === "gradiente") {
    const grd = ctx.createLinearGradient(x - fontPx * 3, y, x + fontPx * 3, y);
    grd.addColorStop(0, t.color);
    grd.addColorStop(1, t.accent);
    ctx.lineWidth = fontPx * 0.14;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = grd;
    ctx.fillText(text, x, y);
  } else {
    // impacto / contorno: thick stroke + fill
    ctx.lineJoin = "round";
    ctx.lineWidth = fontPx * (t.style === "contorno" ? 0.2 : 0.16);
    ctx.strokeStyle = t.accent;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = t.color;
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
