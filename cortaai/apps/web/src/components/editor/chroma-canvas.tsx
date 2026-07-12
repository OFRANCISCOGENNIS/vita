"use client";

// Approximates a chroma-key (green-screen) result on the placeholder media.
// There is no real video to decode, so we render a synthetic subject over the
// key color on an offscreen canvas, remove the key color per-pixel, and
// composite the keyed subject over a replacement background — the user SEES the
// before/after of keying. Pure canvas, export-safe (no external assets).

import { useEffect, useRef } from "react";
import { hexToRgb, keyColorFromImageData } from "@/lib/canvas-fx";

interface ChromaCanvasProps {
  width: number;
  height: number;
  keyColor: string;
  tolerance: number; // 0..100
  softness: number; // 0..100
  showBefore: boolean;
}

export function ChromaCanvas({ width, height, keyColor, tolerance, softness, showBefore }: ChromaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // 1) Synthetic "green-screen" plate on an offscreen canvas.
    const plate = document.createElement("canvas");
    plate.width = W;
    plate.height = H;
    const pctx = plate.getContext("2d");
    if (!pctx) return;
    pctx.fillStyle = keyColor;
    pctx.fillRect(0, 0, W, H);
    drawSubject(pctx, W, H);

    // 2) Replacement background (what shows through the keyed pixels).
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#3b1d6e");
    bg.addColorStop(1, "#7a1e5c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // subtle bokeh
    for (let i = 0; i < 6; i++) {
      const gx = ((i * 97) % W);
      const gy = ((i * 53) % H);
      const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, 60);
      grd.addColorStop(0, "rgba(255,255,255,0.10)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(gx - 60, gy - 60, 120, 120);
    }

    if (showBefore) {
      // Show the raw plate (key color visible) so the user compares.
      ctx.drawImage(plate, 0, 0);
      return;
    }

    // 3) Key out the color and composite the subject over the background.
    const img = pctx.getImageData(0, 0, W, H);
    keyColorFromImageData(img, hexToRgb(keyColor), tolerance, softness);
    const keyed = document.createElement("canvas");
    keyed.width = W;
    keyed.height = H;
    keyed.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(keyed, 0, 0);
  }, [width, height, keyColor, tolerance, softness, showBefore]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(width)}
      height={Math.round(height)}
      className="absolute inset-0 h-full w-full"
      aria-label={showBefore ? "Antes do chroma key (fundo verde visível)" : "Depois do chroma key (fundo substituído)"}
      role="img"
    />
  );
}

/** A simple person-ish subject so keying has something to reveal. */
function drawSubject(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const cx = W / 2;
  // body
  ctx.fillStyle = "#2b3a67";
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.22, H);
  ctx.quadraticCurveTo(cx, H * 0.55, cx + W * 0.22, H);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.fillStyle = "#e8b48c";
  ctx.beginPath();
  ctx.arc(cx, H * 0.42, W * 0.12, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = "#3a2a22";
  ctx.beginPath();
  ctx.arc(cx, H * 0.38, W * 0.125, Math.PI, 0);
  ctx.fill();
}
