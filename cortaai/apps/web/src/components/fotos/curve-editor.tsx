"use client";

// Curvas tab — live histogram (luma + RGB), interactive tone-curve editor
// (monotone cubic through draggable control points, master + R/G/B channels)
// and levels (preto / gama / branco).

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildCurveLUT,
  identityCurve,
  NEUTRAL_LEVELS,
  type CurveChannel,
  type CurvePoint,
  type Histogram,
} from "@/lib/photo-engine";
import { renderShared, usePhotoEditorStore } from "@/store/photo-editor";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

const CHANNELS: { id: CurveChannel; label: string; stroke: string }[] = [
  { id: "master", label: "Mestre", stroke: "#e4e4e7" },
  { id: "r", label: "R", stroke: "#ef4444" },
  { id: "g", label: "G", stroke: "#22c55e" },
  { id: "b", label: "B", stroke: "#3b82f6" },
];

const SIZE = 256; // svg logical size == LUT domain

export function CurvasPanel() {
  const curves = usePhotoEditorStore((s) => s.params.curves);
  const levels = usePhotoEditorStore((s) => s.params.levels);
  const setCurves = usePhotoEditorStore((s) => s.setCurves);
  const setLevels = usePhotoEditorStore((s) => s.setLevels);
  const [channel, setChannel] = useState<CurveChannel>("master");
  const [hist, setHist] = useState<Histogram | null>(renderShared.histogram);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);

  // The stage pings after each rendered frame while this tab is open.
  useEffect(() => {
    const cb = () => setHist(renderShared.histogram);
    renderShared.listeners.add(cb);
    setHist(renderShared.histogram);
    return () => {
      renderShared.listeners.delete(cb);
    };
  }, []);

  const points = curves[channel];
  const lut = buildCurveLUT(points);

  const setChannelPoints = useCallback(
    (pts: CurvePoint[]) => setCurves({ ...curves, [channel]: pts }),
    [curves, channel, setCurves],
  );

  function svgCoords(e: { clientX: number; clientY: number }): CurvePoint | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(255, ((e.clientX - rect.left) / rect.width) * SIZE)),
      y: Math.max(0, Math.min(255, 255 - ((e.clientY - rect.top) / rect.height) * SIZE)),
    };
  }

  function onSvgPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const p = svgCoords(e);
    if (!p) return;
    // near an existing point? drag it; otherwise insert a new one
    let idx = -1;
    for (let i = 0; i < points.length; i++) {
      if (Math.abs(points[i].x - p.x) < 12 && Math.abs(points[i].y - p.y) < 14) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      if (points.length >= 12) return;
      const pts = [...points, { x: Math.round(p.x), y: Math.round(p.y) }].sort((a, b) => a.x - b.x);
      setChannelPoints(pts);
      idx = pts.findIndex((q) => q.x === Math.round(p.x) && q.y === Math.round(p.y));
    }
    dragRef.current = idx;
    // Capture on the SVG (stable element) — the circle under the pointer can
    // remount while its coordinates change during the drag.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onSvgPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const idx = dragRef.current;
    if (idx === null) return;
    const p = svgCoords(e);
    if (!p) return;
    const pts = [...points];
    const prev = pts[idx - 1];
    const next = pts[idx + 1];
    const minX = prev ? prev.x + 2 : 0;
    const maxX = next ? next.x - 2 : 255;
    pts[idx] = { x: Math.round(Math.max(minX, Math.min(maxX, p.x))), y: Math.round(p.y) };
    setChannelPoints(pts);
  }

  function onSvgPointerUp() {
    dragRef.current = null;
  }

  function removePoint(idx: number) {
    if (points.length <= 2) return;
    setChannelPoints(points.filter((_, i) => i !== idx));
  }

  function nudgePoint(idx: number, dx: number, dy: number) {
    const pts = [...points];
    const prev = pts[idx - 1];
    const next = pts[idx + 1];
    pts[idx] = {
      x: Math.round(Math.max(prev ? prev.x + 2 : 0, Math.min(next ? next.x - 2 : 255, pts[idx].x + dx))),
      y: Math.round(Math.max(0, Math.min(255, pts[idx].y + dy))),
    };
    setChannelPoints(pts);
  }

  // Curve path from the LUT (y flipped for SVG)
  let path = `M 0 ${255 - lut[0]}`;
  for (let x = 4; x < 256; x += 4) path += ` L ${x} ${255 - lut[x]}`;
  path += ` L 255 ${255 - lut[255]}`;

  const active = CHANNELS.find((c) => c.id === channel)!;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1" role="tablist" aria-label="Canal da curva">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={channel === c.id}
              onClick={() => setChannel(c.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                channel === c.id ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white" : "text-zinc-400 hover:text-white",
              )}
              style={channel === c.id || c.id === "master" ? undefined : { color: c.stroke }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setChannelPoints(identityCurve())}
          aria-label={`Resetar curva ${active.label}`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Resetar
        </Button>
      </div>

      <div className="rounded-xl border border-line bg-black/40 p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="block aspect-square w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`Editor de curva de tons — canal ${active.label}. Clique para adicionar pontos, arraste para ajustar.`}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
        >
          {/* grid */}
          {[64, 128, 192].map((g) => (
            <g key={g} stroke="rgba(255,255,255,0.08)" strokeWidth="1">
              <line x1={g} y1={0} x2={g} y2={SIZE} />
              <line x1={0} y1={g} x2={SIZE} y2={g} />
            </g>
          ))}
          {/* histogram */}
          {hist && <HistogramPaths hist={hist} />}
          {/* identity diagonal */}
          <line x1={0} y1={255} x2={255} y2={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
          {/* curve */}
          <path d={path} fill="none" stroke={active.stroke} strokeWidth="2.2" />
          {/* control points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={255 - p.y}
              r={7}
              fill={active.stroke}
              stroke="#0a0a0f"
              strokeWidth="2"
              tabIndex={0}
              role="slider"
              aria-label={`Ponto ${i + 1}: entrada ${p.x}, saída ${p.y}. Setas para ajustar, Delete para remover.`}
              aria-valuenow={p.y}
              aria-valuemin={0}
              aria-valuemax={255}
              className="cursor-move focus:outline-none focus:stroke-violet-400"
              onDoubleClick={() => removePoint(i)}
              onKeyDown={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  removePoint(i);
                } else if (e.key.startsWith("Arrow")) {
                  e.preventDefault();
                  const step = e.shiftKey ? 8 : 2;
                  nudgePoint(
                    i,
                    e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
                    e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0,
                  );
                }
              }}
            />
          ))}
        </svg>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Clique na curva para adicionar um ponto; arraste para ajustar; duplo clique (ou Delete) remove.
      </p>

      {/* Levels */}
      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Níveis</h3>
          <Button size="sm" variant="ghost" onClick={() => setLevels({ ...NEUTRAL_LEVELS })} aria-label="Resetar níveis">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Resetar
          </Button>
        </div>
        <Slider label="Preto (entrada)" min={0} max={120} value={levels.black} onChange={(v) => setLevels({ ...levels, black: v })} />
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-400">
            <span>Gama (meios-tons)</span>
            <span className="font-mono text-zinc-300">{levels.gamma.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={20}
            max={250}
            value={Math.round(levels.gamma * 100)}
            onChange={(e) => setLevels({ ...levels, gamma: Number(e.target.value) / 100 })}
            aria-label="Gama (meios-tons)"
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          />
        </div>
        <Slider label="Branco (entrada)" min={135} max={255} value={levels.white} onChange={(v) => setLevels({ ...levels, white: v })} />
      </div>
    </div>
  );
}

function HistogramPaths({ hist }: { hist: Histogram }) {
  const build = (arr: Uint32Array) => {
    let d = `M 0 ${SIZE}`;
    for (let i = 0; i < 256; i += 2) {
      const v = Math.min(1, arr[i] / hist.max);
      d += ` L ${i} ${SIZE - v * (SIZE - 12)}`;
    }
    d += ` L 255 ${SIZE} Z`;
    return d;
  };
  return (
    <g aria-hidden>
      <path d={build(hist.luma)} fill="rgba(228,228,231,0.16)" />
      <path d={build(hist.r)} fill="none" stroke="rgba(239,68,68,0.55)" strokeWidth="1" />
      <path d={build(hist.g)} fill="none" stroke="rgba(34,197,94,0.55)" strokeWidth="1" />
      <path d={build(hist.b)} fill="none" stroke="rgba(59,130,246,0.55)" strokeWidth="1" />
    </g>
  );
}
