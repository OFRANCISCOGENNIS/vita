"use client";

// Interactive Motion Brush surface. The user drags strokes over an image; each
// stroke captures a normalized path (0-1) and a direction vector (first→last
// point). Strokes are listed and removable. Rendered as SVG so it stays light
// and is loaded lazily via next/dynamic. Keyboard: a "Limpar" and per-stroke
// remove keep it operable without a mouse for management (drawing needs pointer).

import { useRef, useState } from "react";
import { Eraser, Trash2 } from "lucide-react";
import type { MotionBrushStroke } from "@/lib/types";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface MotionBrushCanvasProps {
  imageUrl: string;
  strokes: MotionBrushStroke[];
  onChange: (strokes: MotionBrushStroke[]) => void;
  intensity: number;
  onIntensityChange: (v: number) => void;
}

const STROKE_COLORS = ["#a78bfa", "#f0abfc", "#67e8f9", "#fca5a5", "#86efac", "#fcd34d"];

export default function MotionBrushCanvas({
  imageUrl,
  strokes,
  onChange,
  intensity,
  onIntensityChange,
}: MotionBrushCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState<[number, number][] | null>(null);

  function pointFromEvent(e: React.PointerEvent): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
  }

  function toPct(p: [number, number]): string {
    return `${p[0] * 100},${p[1] * 100}`;
  }

  function finalize(path: [number, number][]) {
    if (path.length < 2) return;
    const first = path[0];
    const last = path[path.length - 1];
    const direction: [number, number] = [
      Math.round((last[0] - first[0]) * 1000) / 1000,
      Math.round((last[1] - first[1]) * 1000) / 1000,
    ];
    onChange([...strokes, { path, direction, intensity: intensity / 100 }]);
  }

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-xl border border-line bg-surface-2"
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Base do Motion Brush" className="pointer-events-none block w-full select-none" draggable={false} />
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrawing([pointFromEvent(e)]);
          }}
          onPointerMove={(e) => {
            if (!drawing) return;
            setDrawing((prev) => (prev ? [...prev, pointFromEvent(e)] : prev));
          }}
          onPointerUp={() => {
            if (drawing) finalize(drawing);
            setDrawing(null);
          }}
          role="application"
          aria-label="Área de Motion Brush: arraste para pincelar regiões de movimento"
        >
          <defs>
            {STROKE_COLORS.map((c, i) => (
              <marker key={i} id={`mb-arrow-${i}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0 0 L10 5 L0 10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {strokes.map((s, i) => {
            const color = STROKE_COLORS[i % STROKE_COLORS.length];
            const first = s.path[0];
            const last = s.path[s.path.length - 1];
            return (
              <g key={i}>
                <polyline
                  points={s.path.map(toPct).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.4}
                  strokeOpacity={0.55}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={first[0] * 100}
                  y1={first[1] * 100}
                  x2={last[0] * 100}
                  y2={last[1] * 100}
                  stroke={color}
                  strokeWidth={2.4}
                  vectorEffect="non-scaling-stroke"
                  markerEnd={`url(#mb-arrow-${i % STROKE_COLORS.length})`}
                />
              </g>
            );
          })}
          {drawing && drawing.length > 1 && (
            <polyline
              points={drawing.map(toPct).join(" ")}
              fill="none"
              stroke="#ffffff"
              strokeWidth={2.4}
              strokeOpacity={0.8}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      <div className="mt-3">
        <Slider
          label={`Intensidade do movimento (${intensity}%)`}
          value={intensity}
          min={10}
          max={100}
          step={5}
          onChange={onIntensityChange}
          aria-label="Intensidade do movimento do próximo traço"
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {strokes.length === 0 ? "Nenhum traço ainda — arraste sobre a imagem." : `${strokes.length} ${strokes.length === 1 ? "traço" : "traços"}`}
        </p>
        {strokes.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-zinc-300 hover:border-rose-500/60 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden /> Limpar tudo
          </button>
        )}
      </div>

      {strokes.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {strokes.map((s, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-zinc-300"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STROKE_COLORS[i % STROKE_COLORS.length] }} aria-hidden />
              <span className={cn("flex-1 truncate")}>
                Traço {i + 1} · {s.path.length} pontos · direção [{s.direction[0].toFixed(2)}, {s.direction[1].toFixed(2)}] · {Math.round(s.intensity * 100)}%
              </span>
              <button
                type="button"
                onClick={() => onChange(strokes.filter((_, j) => j !== i))}
                aria-label={`Remover traço ${i + 1}`}
                className="rounded p-1 text-zinc-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
