"use client";

// Draggable + resizable normalized region drawn over the preview frame.
// Reused by the masks tool and the reframe box. Pointer to drag/resize; when
// focused, arrow keys nudge and Shift+arrows resize — so it stays operable
// without a mouse.

import { useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/edit-visuals";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RegionOverlayProps {
  rect: Rect;
  onChange: (rect: Rect) => void;
  onSelect?: () => void;
  selected?: boolean;
  label: string;
  color?: string; // ring/handle color
  shape?: "rect" | "ellipse";
  minSize?: number;
  /** Keep width == height while resizing (used by the reframe box). */
  lockAspect?: boolean;
}

const HANDLES: { id: string; cx: number; cy: number; cursor: string }[] = [
  { id: "nw", cx: 0, cy: 0, cursor: "nwse-resize" },
  { id: "ne", cx: 1, cy: 0, cursor: "nesw-resize" },
  { id: "sw", cx: 0, cy: 1, cursor: "nesw-resize" },
  { id: "se", cx: 1, cy: 1, cursor: "nwse-resize" },
];

export function RegionOverlay({
  rect,
  onChange,
  onSelect,
  selected = false,
  label,
  color = "#a78bfa",
  shape = "rect",
  minSize = 0.06,
  lockAspect = false,
}: RegionOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  function parentSize(): { w: number; h: number } {
    const parent = boxRef.current?.parentElement;
    const r = parent?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1 };
  }

  function startDrag(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).dataset.handle) return; // handled by resize
    e.preventDefault();
    onSelect?.();
    const { w: pw, h: ph } = parentSize();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...rect };
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / pw;
      const dy = (ev.clientY - startY) / ph;
      onChange({
        ...orig,
        x: clamp(orig.x + dx, 0, 1 - orig.w),
        y: clamp(orig.y + dy, 0, 1 - orig.h),
      });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startResize(e: ReactPointerEvent, handle: string) {
    e.preventDefault();
    e.stopPropagation();
    onSelect?.();
    const { w: pw, h: ph } = parentSize();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...rect };
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function move(ev: PointerEvent) {
      let dx = (ev.clientX - startX) / pw;
      let dy = (ev.clientY - startY) / ph;
      if (lockAspect) {
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        dx = d;
        dy = d;
      }
      let { x, y, w, h } = orig;
      if (handle.includes("w")) {
        x = clamp(orig.x + dx, 0, orig.x + orig.w - minSize);
        w = orig.w - (x - orig.x);
      }
      if (handle.includes("e")) {
        w = clamp(orig.w + dx, minSize, 1 - orig.x);
      }
      if (handle.includes("n")) {
        y = clamp(orig.y + dy, 0, orig.y + orig.h - minSize);
        h = orig.h - (y - orig.y);
      }
      if (handle.includes("s")) {
        h = clamp(orig.h + dy, minSize, 1 - orig.y);
      }
      onChange({ x, y, w, h });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onKey(e: KeyboardEvent) {
    const step = e.altKey ? 0.01 : 0.03;
    let handled = true;
    const next = { ...rect };
    if (e.shiftKey) {
      if (e.key === "ArrowRight") next.w = clamp(rect.w + step, minSize, 1 - rect.x);
      else if (e.key === "ArrowLeft") next.w = clamp(rect.w - step, minSize, 1 - rect.x);
      else if (e.key === "ArrowDown") next.h = clamp(rect.h + step, minSize, 1 - rect.y);
      else if (e.key === "ArrowUp") next.h = clamp(rect.h - step, minSize, 1 - rect.y);
      else handled = false;
      if (lockAspect) next.h = next.w;
    } else {
      if (e.key === "ArrowRight") next.x = clamp(rect.x + step, 0, 1 - rect.w);
      else if (e.key === "ArrowLeft") next.x = clamp(rect.x - step, 0, 1 - rect.w);
      else if (e.key === "ArrowDown") next.y = clamp(rect.y + step, 0, 1 - rect.h);
      else if (e.key === "ArrowUp") next.y = clamp(rect.y - step, 0, 1 - rect.h);
      else handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      onChange(next);
    }
  }

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={`${label} — arraste ou use as setas para mover, Shift+setas para redimensionar`}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={onKey}
      onFocus={onSelect}
      className={cn(
        "absolute cursor-move touch-none focus-visible:outline-none",
        selected ? "z-30" : "z-20",
      )}
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }}
    >
      <div
        className={cn(
          "absolute inset-0 border-2",
          shape === "ellipse" ? "rounded-full" : "rounded-md",
          selected ? "border-solid" : "border-dashed",
        )}
        style={{ borderColor: color, boxShadow: selected ? `0 0 0 9999px rgba(0,0,0,0)` : undefined }}
      />
      <span
        className="pointer-events-none absolute -top-5 left-0 rounded bg-black/70 px-1 text-[9px] font-medium text-white"
        style={{ color }}
      >
        {label}
      </span>
      {selected &&
        HANDLES.map((hnd) => (
          <button
            key={hnd.id}
            data-handle={hnd.id}
            aria-label={`Redimensionar ${hnd.id}`}
            onPointerDown={(e) => startResize(e, hnd.id)}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            style={{ left: `${hnd.cx * 100}%`, top: `${hnd.cy * 100}%`, cursor: hnd.cursor }}
          />
        ))}
    </div>
  );
}
