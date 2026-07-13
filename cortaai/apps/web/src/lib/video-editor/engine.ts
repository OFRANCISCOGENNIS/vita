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

    const d = resolve(clip);
    if (!d || !d.w || !d.h) continue;

    const env = animEnvelope(clip, clipTime);
    const opacity = clamp01(valueAt(clip, "opacity", clipTime) * env.opacity);
    if (opacity <= 0) continue;
    const scale = valueAt(clip, "scale", clipTime) * env.scale;
    const rotation = valueAt(clip, "rotation", clipTime) + env.rotation;
    const tx = (valueAt(clip, "x", clipTime) + env.dx) * canvasW;
    const ty = (valueAt(clip, "y", clipTime) + env.dy) * canvasH;

    // cover: preenche o canvas mantendo proporção da fonte
    const cover = Math.max(canvasW / d.w, canvasH / d.h);
    const drawW = d.w * cover * scale;
    const drawH = d.h * cover * scale;

    const filter = filterById(clip.filterId);
    const blurPx = env.blurPx > 0 ? (env.blurPx / 100) * canvasH * 0.06 : 0;
    const filterCss = [filter?.css !== "none" ? filter?.css : "", blurPx > 0 ? `blur(${blurPx.toFixed(1)}px)` : ""]
      .filter(Boolean)
      .join(" ");

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = BLEND_MAP[clip.blendMode] ?? "source-over";
    if (filterCss) ctx.filter = filterCss;
    ctx.translate(canvasW / 2 + tx, canvasH / 2 + ty);
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    try {
      ctx.drawImage(d.el, -drawW / 2, -drawH / 2, drawW, drawH);
    } catch {
      /* frame não pronto */
    }
    ctx.restore();

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

  ctx.restore();
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
    }
  }
}
