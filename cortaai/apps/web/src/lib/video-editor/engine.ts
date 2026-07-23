// MOTOR de composição — desenha um frame do projeto num canvas 2D, num dado
// instante da timeline. Função pura em relação ao estado: recebe o projeto, o
// tempo e um resolvedor que devolve o elemento desenhável (vídeo/imagem já
// posicionado no tempo certo) de cada clipe. Usado tanto no preview quanto (no
// futuro) no export multitrilha.

import type { Clip, Project } from "./model";
import { applyEasing, clipAtTime, tracksForRender } from "./timeline-math";
import type { AnimatableProperty } from "./model";
import { animEnvelope } from "./animations";
import { filterById } from "./filters";
import { transitionAt, type ActiveTransition } from "./transitions";

export interface Drawable {
  el: CanvasImageSource;
  w: number;
  h: number;
}

/** Valor de uma propriedade animável no tempo do clipe (keyframes ou base). */
export function valueAt(clip: Clip, property: AnimatableProperty, clipTimeMs: number): number {
  const base = baseValue(clip, property);
  const kfs = clip.keyframes.filter((k) => k.property === property).sort((a, b) => a.timeMs - b.timeMs);
  if (kfs.length === 0) return base;
  if (clipTimeMs <= kfs[0].timeMs) return kfs[0].value;
  if (clipTimeMs >= kfs[kfs.length - 1].timeMs) return kfs[kfs.length - 1].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (clipTimeMs >= a.timeMs && clipTimeMs <= b.timeMs) {
      const f = b.timeMs === a.timeMs ? 0 : applyEasing(b.easing, (clipTimeMs - a.timeMs) / (b.timeMs - a.timeMs));
      return a.value + (b.value - a.value) * f;
    }
  }
  return base;
}

function baseValue(clip: Clip, property: AnimatableProperty): number {
  switch (property) {
    case "x":
      return clip.transform.x;
    case "y":
      return clip.transform.y;
    case "scale":
      return clip.transform.scale;
    case "rotation":
      return clip.transform.rotation;
    case "opacity":
      return clip.transform.opacity;
    case "volume":
      return clip.volume;
  }
}

/**
 * Provider de máscara de PESSOA (remoção de fundo por IA). Registrado em
 * runtime pelo módulo de IA (lib/ai/video-segmenter) para manter o motor puro.
 * Recebe o elemento-fonte e devolve um canvas de máscara (alpha = pessoa).
 */
export type BgMaskProvider = (el: CanvasImageSource, srcW: number, srcH: number) => CanvasImageSource | null;
let bgMaskProvider: BgMaskProvider | null = null;
export function setBgMaskProvider(p: BgMaskProvider | null): void {
  bgMaskProvider = p;
}

const BLEND_MAP: Record<string, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  lighten: "lighten",
  darken: "darken",
  difference: "difference",
};

/**
 * Compõe todas as trilhas visíveis no canvas para o instante `playheadMs`.
 * `resolve(clip)` deve devolver o elemento a desenhar (com dimensões-fonte) já
 * apresentando o frame correto, ou null (ex.: mídia ainda não carregada).
 */
export function drawComposite(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  project: Project,
  playheadMs: number,
  resolve: (clip: Clip) => Drawable | null,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasW, canvasH);

  for (const track of tracksForRender(project.tracks)) {
    const clip = clipAtTime(track, playheadMs);
    if (!clip) continue;
    const clipTime = playheadMs - clip.startInTimeline;

    if (track.type === "text") {
      drawText(ctx, canvasW, canvasH, clip, clipTime);
      continue;
    }

    const trans = transitionAt(track, clip, clipTime);
    if (trans) drawWithTransition(ctx, canvasW, canvasH, clip, clipTime, trans, resolve, playheadMs);
    else drawVisualClip(ctx, canvasW, canvasH, clip, clipTime, resolve, playheadMs);
  }

  ctx.restore();
}

interface DrawMods {
  alphaMul?: number;
  scaleMul?: number;
}

/** Desenha um clipe visual (vídeo/imagem) com transformações, filtro, animações e efeitos. */
function drawVisualClip(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  clip: Clip,
  clipTime: number,
  resolve: (clip: Clip) => Drawable | null,
  playheadMs: number,
  mods?: DrawMods,
): void {
  const d = resolve(clip);
  if (!d || !d.w || !d.h) return;

  const env = animEnvelope(clip, clipTime);
  const opacity = clamp01(valueAt(clip, "opacity", clipTime) * env.opacity * (mods?.alphaMul ?? 1));
  if (opacity <= 0) return;
  const scale = valueAt(clip, "scale", clipTime) * env.scale * (mods?.scaleMul ?? 1);
  const rotation = valueAt(clip, "rotation", clipTime) + env.rotation;
  const tx = (valueAt(clip, "x", clipTime) + env.dx) * canvasW;
  const ty = (valueAt(clip, "y", clipTime) + env.dy) * canvasH;

  // cover: preenche o canvas mantendo proporção da fonte
  const cover = Math.max(canvasW / d.w, canvasH / d.h);
  const drawW = d.w * cover * scale;
  const drawH = d.h * cover * scale;

  const filter = filterById(clip.filterId);
  const blurPx = env.blurPx > 0 ? (env.blurPx / 100) * canvasH * 0.06 : 0;
  const ca = clip.colorAdjust;
  const gradeCss = ca
    ? `brightness(${(1 + ca.brightness / 100).toFixed(3)}) contrast(${(1 + ca.contrast / 100).toFixed(3)}) saturate(${Math.max(0, 1 + ca.saturation / 100).toFixed(3)})${ca.hue ? ` hue-rotate(${Math.round(ca.hue)}deg)` : ""}`
    : "";
  const filterCss = [filter?.css !== "none" ? filter?.css : "", gradeCss, blurPx > 0 ? `blur(${blurPx.toFixed(1)}px)` : ""]
    .filter(Boolean)
    .join(" ");

  const blendOp = BLEND_MAP[clip.blendMode] ?? "source-over";
  if (clip.mask || clip.chroma || clip.bgRemove) {
    // desenha num buffer, recorta pela máscara (com feather) e compõe no palco
    const buf = getMaskBuffer(canvasW, canvasH);
    if (buf) {
      const bctx = buf.ctx;
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = "source-over";
      bctx.filter = filterCss || "none";
      bctx.clearRect(0, 0, canvasW, canvasH);
      bctx.save();
      bctx.translate(canvasW / 2 + tx, canvasH / 2 + ty);
      if (rotation) bctx.rotate((rotation * Math.PI) / 180);
      try {
        bctx.drawImage(d.el, -drawW / 2, -drawH / 2, drawW, drawH);
      } catch {
        /* frame não pronto */
      }
      bctx.restore();
      bctx.filter = "none";
      // remoção de fundo por IA: máscara de pessoa aplicada com a MESMA
      // transformação do frame (o provider é registrado pelo módulo de IA)
      if (clip.bgRemove && bgMaskProvider) {
        const maskEl = bgMaskProvider(d.el, d.w, d.h);
        if (maskEl) {
          bctx.save();
          bctx.globalCompositeOperation = "destination-in";
          bctx.translate(canvasW / 2 + tx, canvasH / 2 + ty);
          if (rotation) bctx.rotate((rotation * Math.PI) / 180);
          try {
            bctx.drawImage(maskEl, -drawW / 2, -drawH / 2, drawW, drawH);
          } catch {
            /* máscara indisponível neste frame */
          }
          bctx.restore();
          bctx.globalCompositeOperation = "source-over";
        }
      }
      if (clip.chroma) applyChromaKey(bctx, canvasW, canvasH, clip.chroma);
      if (clip.mask) paintMask(bctx, clip.mask, canvasW, canvasH);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = blendOp;
      ctx.drawImage(buf.canvas, 0, 0);
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendOp;
    if (filterCss) ctx.filter = filterCss;
    ctx.translate(canvasW / 2 + tx, canvasH / 2 + ty);
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    try {
      ctx.drawImage(d.el, -drawW / 2, -drawH / 2, drawW, drawH);
    } catch {
      /* frame não pronto */
    }
    ctx.restore();
  }

  // tint do filtro (por cima da área do clipe — aproximação: palco inteiro)
  if (filter?.overlay && opacity > 0) {
    ctx.save();
    ctx.globalAlpha = filter.overlay.opacity * opacity;
    ctx.globalCompositeOperation = (filter.overlay.blend as GlobalCompositeOperation) || "source-over";
    ctx.fillStyle = filter.overlay.color;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }

  // efeitos de sobreposição (vinheta / grão / VHS)
  if (clip.effects.length > 0 && opacity > 0) {
    applyOverlayEffects(ctx, canvasW, canvasH, clip, playheadMs);
  }
}

/** Desenha o clipe anterior (congelado no fim) + o atual entrando, conforme a transição. */
function drawWithTransition(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  clip: Clip,
  clipTime: number,
  trans: ActiveTransition,
  resolve: (clip: Clip) => Drawable | null,
  playheadMs: number,
): void {
  const p = trans.progress;
  const prevTime = Math.max(0, trans.prev.duration - 1);
  const drawPrev = (mods?: DrawMods) => drawVisualClip(ctx, canvasW, canvasH, trans.prev, prevTime, resolve, playheadMs, mods);
  const drawCur = (mods?: DrawMods) => drawVisualClip(ctx, canvasW, canvasH, clip, clipTime, resolve, playheadMs, mods);

  switch (trans.id) {
    case "escurecer":
      if (p < 0.5) drawPrev({ alphaMul: 1 - 2 * p });
      else drawCur({ alphaMul: 2 * p - 1 });
      break;
    case "deslizar":
      drawPrev();
      ctx.save();
      ctx.translate((1 - p) * canvasW, 0);
      drawCur();
      ctx.restore();
      break;
    case "deslizar-cima":
      // o novo clipe sobe de baixo para cima
      drawPrev();
      ctx.save();
      ctx.translate(0, (1 - p) * canvasH);
      drawCur();
      ctx.restore();
      break;
    case "empurrar":
      // push: o anterior sai pela esquerda enquanto o novo entra pela direita
      ctx.save();
      ctx.translate(-p * canvasW, 0);
      drawPrev();
      ctx.restore();
      ctx.save();
      ctx.translate((1 - p) * canvasW, 0);
      drawCur();
      ctx.restore();
      break;
    case "giro":
      // spin: o novo clipe gira meia-volta e cresce até assentar
      drawPrev({ alphaMul: 1 - p });
      ctx.save();
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate((1 - p) * Math.PI);
      ctx.translate(-canvasW / 2, -canvasH / 2);
      drawCur({ alphaMul: p, scaleMul: 0.4 + 0.6 * p });
      ctx.restore();
      break;
    case "relogio": {
      // clock wipe: uma varredura angular revela o novo clipe
      drawPrev();
      const R = Math.hypot(canvasW, canvasH);
      const a0 = -Math.PI / 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(canvasW / 2, canvasH / 2);
      ctx.arc(canvasW / 2, canvasH / 2, R, a0, a0 + Math.max(0.001, p) * Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawCur();
      ctx.restore();
      break;
    }
    case "xadrez": {
      // checkerboard: ladrilhos crescem em cascata na diagonal
      drawPrev();
      const cols = 8;
      const rows = Math.max(4, Math.round((cols * canvasH) / canvasW));
      const tw = canvasW / cols;
      const th = canvasH / rows;
      ctx.save();
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const delay = (r + c) / (rows + cols);
          const local = clamp01((p - delay) / (1 - delay + 0.0001));
          if (local <= 0) continue;
          const w = tw * local;
          const h = th * local;
          ctx.rect(c * tw + (tw - w) / 2, r * th + (th - h) / 2, w, h);
        }
      }
      ctx.clip();
      drawCur();
      ctx.restore();
      break;
    }
    case "diagonal": {
      // wipe diagonal do canto superior-esquerdo
      drawPrev();
      const t = p * 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(t * canvasW, 0);
      ctx.lineTo(0, t * canvasH);
      ctx.closePath();
      ctx.clip();
      drawCur();
      ctx.restore();
      break;
    }
    case "flash": {
      // corte com estouro de luz branca no meio
      if (p < 0.5) drawPrev();
      else drawCur();
      const a = 1 - Math.abs(p - 0.5) * 2;
      if (a > 0) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
      }
      break;
    }
    case "circulo":
      drawPrev();
      ctx.save();
      ctx.beginPath();
      ctx.arc(canvasW / 2, canvasH / 2, Math.max(1, (p * Math.hypot(canvasW, canvasH)) / 2), 0, Math.PI * 2);
      ctx.clip();
      drawCur();
      ctx.restore();
      break;
    case "zoom":
      drawPrev({ alphaMul: 1 - p, scaleMul: 1 + 0.2 * p });
      drawCur({ alphaMul: p });
      break;
    case "cortina":
      // wipe: o novo clipe entra da esquerda como uma cortina
      drawPrev();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Math.max(1, p * canvasW), canvasH);
      ctx.clip();
      drawCur();
      ctx.restore();
      break;
    case "persiana": {
      // blinds: 8 faixas horizontais abrem simultaneamente
      drawPrev();
      const bands = 8;
      const bandH = canvasH / bands;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < bands; i++) {
        ctx.rect(0, i * bandH, canvasW, Math.max(1, p * bandH));
      }
      ctx.clip();
      drawCur();
      ctx.restore();
      break;
    }
    case "fundido":
    default:
      drawPrev({ alphaMul: 1 - p });
      drawCur({ alphaMul: p });
  }
}

function drawText(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, clip: Clip, clipTime: number): void {
  if (!clip.text) return;
  const env = animEnvelope(clip, clipTime);
  const opacity = clamp01(valueAt(clip, "opacity", clipTime) * env.opacity);
  if (opacity <= 0) return;
  const scale = valueAt(clip, "scale", clipTime) * env.scale;
  const tx = (valueAt(clip, "x", clipTime) + env.dx) * canvasW;
  const ty = (valueAt(clip, "y", clipTime) + env.dy) * canvasH;
  const px = Math.max(16, canvasH * 0.05 * scale);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `${clip.text.fontWeight} ${px}px ${clip.text.fontFamily || "Inter"}, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = canvasW / 2 + tx;
  const cy = canvasH / 2 + ty;
  if (clip.text.background) {
    const w = ctx.measureText(clip.text.content).width;
    ctx.fillStyle = clip.text.background;
    ctx.fillRect(cx - w / 2 - px * 0.3, cy - px * 0.7, w + px * 0.6, px * 1.4);
  }
  ctx.lineWidth = Math.max(2, px * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.strokeText(clip.text.content, cx, cy);
  ctx.fillStyle = clip.text.color || "#fff";
  ctx.fillText(clip.text.content, cx, cy);
  ctx.restore();
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// -------------------------------------------------- efeitos de sobreposição

let noiseCanvas: HTMLCanvasElement | null = null;
function getNoiseCanvas(): HTMLCanvasElement | null {
  if (noiseCanvas) return noiseCanvas;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const nctx = c.getContext("2d");
  if (!nctx) return null;
  const img = nctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

function applyOverlayEffects(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  clip: Clip,
  playheadMs: number,
): void {
  for (const fx of clip.effects) {
    const k = Math.min(1, Math.max(0, fx.intensity));
    if (k <= 0) continue;

    if (fx.id === "vignette") {
      const grad = ctx.createRadialGradient(
        canvasW / 2,
        canvasH / 2,
        Math.min(canvasW, canvasH) * 0.35,
        canvasW / 2,
        canvasH / 2,
        Math.max(canvasW, canvasH) * 0.75,
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${(0.85 * k).toFixed(3)})`);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.restore();
    } else if (fx.id === "grain") {
      const noise = getNoiseCanvas();
      if (!noise) continue;
      // desloca o padrão a cada frame para o grão "viver"
      const ox = (playheadMs * 7) % 256;
      const oy = (playheadMs * 13) % 256;
      ctx.save();
      ctx.globalAlpha = 0.28 * k;
      ctx.globalCompositeOperation = "overlay";
      for (let y = -oy; y < canvasH; y += 256) {
        for (let x = -ox; x < canvasW; x += 256) {
          ctx.drawImage(noise, x, y);
        }
      }
      ctx.restore();
    } else if (fx.id === "vhs") {
      ctx.save();
      // scanlines
      ctx.globalAlpha = 0.22 * k;
      ctx.fillStyle = "#000";
      const step = Math.max(3, Math.round(canvasH / 240));
      for (let y = 0; y < canvasH; y += step * 2) {
        ctx.fillRect(0, y, canvasW, step);
      }
      // faixa de tracking que percorre a tela
      const bandY = ((playheadMs * 0.12) % (canvasH + 80)) - 40;
      ctx.globalAlpha = 0.12 * k;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, bandY, canvasW, 26);
      ctx.restore();
    } else if (fx.id === "glitch") {
      // fatias horizontais deslocadas (o canvas se auto-copia) + linha colorida
      const t = Math.floor(playheadMs / 90); // salta ~11x/s
      ctx.save();
      for (let i = 0; i < 6; i++) {
        if (hash01(i * 2.17 + t * 1.31) > 0.35 + 0.5 * (1 - k)) continue; // nem toda fatia, sempre
        const y = Math.floor(hash01(i * 3.7 + t) * canvasH);
        const bh = Math.max(2, Math.floor((0.01 + hash01(i * 5.3 + t) * 0.05) * canvasH));
        const dx = Math.round((hash01(i * 9.1 + t) - 0.5) * canvasW * 0.14 * k);
        try {
          ctx.drawImage(ctx.canvas, 0, y, canvasW, bh, dx, y, canvasW, bh);
        } catch {
          /* ignore */
        }
      }
      // risco ciano/vermelho fino
      ctx.globalAlpha = 0.25 * k;
      ctx.fillStyle = hash01(t) > 0.5 ? "#22d3ee" : "#f43f5e";
      ctx.fillRect(0, Math.floor(hash01(t * 7.7) * canvasH), canvasW, Math.max(1, canvasH / 360));
      ctx.restore();
    } else if (fx.id === "light-leak") {
      // dois brilhos quentes que passeiam devagar pela tela (blend screen)
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const spots: [number, number, string][] = [
        [(Math.sin(playheadMs * 0.00037) * 0.5 + 0.5) * canvasW, canvasH * 0.25, "255,140,60"],
        [(Math.cos(playheadMs * 0.00023) * 0.5 + 0.5) * canvasW, canvasH * 0.75, "255,80,120"],
      ];
      for (const [cx, cy, rgb] of spots) {
        const r = Math.max(canvasW, canvasH) * 0.55;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(${rgb},${(0.4 * k).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
      ctx.restore();
    } else if (fx.id === "snow") {
      ctx.save();
      ctx.fillStyle = "#fff";
      const n = 90;
      for (let i = 0; i < n; i++) {
        const speed = 0.05 + hash01(i * 2.3) * 0.08; // fração da altura por segundo
        const y01 = (hash01(i * 5.7) + (playheadMs / 1000) * speed) % 1;
        const x = hash01(i * 1.111) * canvasW + Math.sin(playheadMs * 0.001 + i) * canvasW * 0.012;
        const r = (1 + hash01(i * 8.8) * 2.2) * (canvasH / 540);
        ctx.globalAlpha = (0.35 + hash01(i * 4.1) * 0.45) * k;
        ctx.beginPath();
        ctx.arc(x, y01 * canvasH, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (fx.id === "rain") {
      ctx.save();
      ctx.strokeStyle = `rgba(190,215,255,${(0.35 * k).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, canvasH / 720);
      const n = 70;
      const len = canvasH * 0.045;
      for (let i = 0; i < n; i++) {
        const speed = 0.7 + hash01(i * 3.1) * 0.6;
        const y01 = (hash01(i * 4.4) + (playheadMs / 1000) * speed) % 1;
        const x = ((hash01(i * 1.7) + y01 * 0.05) % 1) * canvasW;
        const y = y01 * canvasH;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.18, y + len);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/** Pseudo-aleatório determinístico 0..1 (mesmo resultado no preview e no export). */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// -------------------------------------------------------------------- máscara

let _maskBuf: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
function getMaskBuffer(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  if (!_maskBuf || _maskBuf.canvas.width !== w || _maskBuf.canvas.height !== h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    _maskBuf = { canvas, ctx };
  }
  return _maskBuf;
}

/** Recorta o conteúdo do buffer pela forma da máscara (feather via blur). */
function paintMask(bctx: CanvasRenderingContext2D, mask: NonNullable<Clip["mask"]>, w: number, h: number): void {
  const cx = mask.x * w;
  const cy = mask.y * h;
  const mw = mask.w * w;
  const mh = mask.h * h;
  const blur = mask.feather * Math.min(w, h) * 0.2;
  bctx.save();
  if (blur > 0) bctx.filter = `blur(${blur.toFixed(1)}px)`;
  if (mask.inverted) {
    // mantém o de FORA da forma: apaga a região da forma
    bctx.globalCompositeOperation = "destination-out";
    bctx.fillStyle = "#fff";
    tracePath(bctx, mask.kind, cx, cy, mw, mh);
    bctx.fill();
  } else {
    // mantém só o de DENTRO da forma
    bctx.globalCompositeOperation = "destination-in";
    bctx.fillStyle = "#fff";
    tracePath(bctx, mask.kind, cx, cy, mw, mh);
    bctx.fill();
  }
  bctx.restore();
}

/** Chroma key: remove a cor-chave (fundo verde/azul) tornando-a transparente. */
function applyChromaKey(
  bctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  chroma: { color: string; tolerance: number; softness: number },
): void {
  const kr = parseInt(chroma.color.slice(1, 3), 16);
  const kg = parseInt(chroma.color.slice(3, 5), 16);
  const kb = parseInt(chroma.color.slice(5, 7), 16);
  // limiares em distância euclidiana RGB (0..441)
  const t0 = chroma.tolerance * 255;
  const t1 = t0 + Math.max(1, chroma.softness * 255);
  let img: ImageData;
  try {
    img = bctx.getImageData(0, 0, w, h);
  } catch {
    return; // canvas contaminado (CORS) — sem keying
  }
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const dr = d[i] - kr;
    const dg = d[i + 1] - kg;
    const db = d[i + 2] - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= t0) {
      d[i + 3] = 0;
    } else if (dist < t1) {
      d[i + 3] = Math.round(d[i + 3] * ((dist - t0) / (t1 - t0)));
    }
  }
  bctx.putImageData(img, 0, 0);
}

function tracePath(ctx: CanvasRenderingContext2D, kind: "rect" | "ellipse", cx: number, cy: number, w: number, h: number): void {
  ctx.beginPath();
  if (kind === "ellipse") {
    ctx.ellipse(cx, cy, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
  } else {
    ctx.rect(cx - w / 2, cy - h / 2, Math.max(1, w), Math.max(1, h));
  }
}
