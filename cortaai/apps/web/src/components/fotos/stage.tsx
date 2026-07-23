"use client";

// Editor de Fotos — canvas stage: zoom/pan viewport, live preview rendering,
// brush tools (stamps hit the FULL-RES base; the preview mirror is re-derived
// per frame via GPU drawImage), crop overlay and draggable element layers.
//
// Rendering is rAF-coalesced: any number of param/pixel changes within a frame
// produce a single pipeline run on the ~1.4MP preview (see photo-engine.ts).

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import {
  blurStamp,
  cloneStamp,
  computeHistogram,
  dodgeBurnStamp,
  downscaleToMax,
  drawWithGeometry,
  eraseColorStamp,
  inverseGeometryPoint,
  liquifyStamp,
  restoreStamp,
  onWatermarkReady,
  paintMaskStamp,
  redEyeStamp,
  renderPhoto,
  sharpenStamp,
  spotHealStamp,
} from "@/lib/photo-engine";
import {
  CLICK_TOOLS,
  PREVIEW_MAX_PIXELS,
  STROKE_TOOLS,
  getBaseCanvas,
  getMaskCanvas,
  getOriginalCanvas,
  getPreviewCanvas,
  renderShared,
  usePhotoEditorStore,
  type ToolId,
} from "@/store/photo-editor";

// Cached plain preview of the original pixels for the "antes" compare view.
const origPreviewCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

const BRUSH_TOOLS: ToolId[] = [...STROKE_TOOLS, ...CLICK_TOOLS];

export function FotoStage() {
  const s = usePhotoEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskOverlayRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const spaceRef = useRef(false);
  const panDragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const strokeRef = useRef<{
    last: { x: number; y: number };
    offset: { x: number; y: number } | null; // clone offset (full-res)
    key: { r: number; g: number; b: number } | null; // borracha key color
    painted: boolean;
  } | null>(null);
  const pixelsRafRef = useRef(0);

  const {
    params, version, comparing, maskVersion, activeTab, tool, brushSize, brushStrength,
    liquifyMode, eraseTolerance, cloneSource, zoom, pan, fitRequest, imgW, imgH,
    selectedLayerId, cropDraft,
  } = s;

  // ------------------------------------------------------------------ render
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const stage = canvasRef.current;
      if (!stage) return;
      if (comparing) {
        const orig = getOriginalCanvas();
        if (!orig) return;
        // Same pixel budget as the live preview; cached so the flip is instant.
        let prevOrig = origPreviewCache.get(orig);
        if (!prevOrig) {
          prevOrig = downscaleToMax(orig, PREVIEW_MAX_PIXELS);
          origPreviewCache.set(orig, prevOrig);
        }
        if (stage.width !== prevOrig.width) stage.width = prevOrig.width;
        if (stage.height !== prevOrig.height) stage.height = prevOrig.height;
        const ctx = stage.getContext("2d")!;
        ctx.clearRect(0, 0, stage.width, stage.height);
        ctx.drawImage(prevOrig, 0, 0);
        return;
      }
      const prev = getPreviewCanvas();
      if (!prev) return;
      renderPhoto(prev, params, stage);
      // Histogram only while the Curvas tab is visible (extra 1.4MP read).
      if (activeTab === "curvas") {
        const ctx = stage.getContext("2d", { willReadFrequently: true })!;
        renderShared.histogram = computeHistogram(ctx.getImageData(0, 0, stage.width, stage.height));
        renderShared.listeners.forEach((cb) => cb());
      }
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [params, version, comparing, activeTab]);

  // Re-render once an async watermark bitmap finishes decoding.
  useEffect(() => {
    onWatermarkReady(() => usePhotoEditorStore.setState((st) => ({ version: st.version + 1 })));
    return () => onWatermarkReady(null);
  }, []);

  // ------------------------------------------------------- mask overlay (pele)
  useEffect(() => {
    const overlay = maskOverlayRef.current;
    const stage = canvasRef.current;
    if (!overlay || !stage) return;
    const show = tool === "suavizar" && !comparing;
    overlay.style.display = show ? "block" : "none";
    if (!show) return;
    const mask = getMaskCanvas();
    if (!mask) return;
    if (overlay.width !== stage.width) overlay.width = stage.width;
    if (overlay.height !== stage.height) overlay.height = stage.height;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.globalAlpha = 0.5;
    // Tint the mask red; drawn through the same geometry transform as the
    // photo so it stays aligned while a live rotation/flip is active.
    const tint = document.createElement("canvas");
    tint.width = overlay.width;
    tint.height = overlay.height;
    const tctx = tint.getContext("2d")!;
    drawWithGeometry(tctx, mask, params.geom, tint.width, tint.height);
    tctx.globalCompositeOperation = "source-in";
    tctx.fillStyle = "#f43f5e";
    tctx.fillRect(0, 0, tint.width, tint.height);
    ctx.drawImage(tint, 0, 0);
    ctx.globalAlpha = 1;
  }, [maskVersion, version, tool, comparing, params.geom]);

  // -------------------------------------------------------------- fit-to-view
  const fit = useCallback(() => {
    const el = containerRef.current;
    const prev = getPreviewCanvas();
    if (!el || !prev) return;
    const z = Math.max(0.05, Math.min(
      (el.clientWidth - 32) / prev.width,
      (el.clientHeight - 32) / prev.height,
    ));
    usePhotoEditorStore.setState({
      zoom: z,
      pan: { x: (el.clientWidth - prev.width * z) / 2, y: (el.clientHeight - prev.height * z) / 2 },
    });
  }, []);

  useEffect(() => {
    fit();
  }, [fitRequest, imgW, imgH, fit]);

  // ------------------------------------------------------------ wheel zoom
  // Native listener: React marks wheel handlers passive, so preventDefault
  // (needed to stop page scroll) requires addEventListener({ passive:false }).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const st = usePhotoEditorStore.getState();
      const rect = el!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const nz = Math.max(0.05, Math.min(8, st.zoom * Math.pow(1.0015, -e.deltaY)));
      const k = nz / st.zoom;
      st.setZoom(nz);
      st.setPan({ x: cx - (cx - st.pan.x) * k, y: cy - (cy - st.pan.y) * k });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ------------------------------------------------------- space-to-pan key
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.isContentEditable)) return;
      spaceRef.current = true;
      if (containerRef.current) containerRef.current.style.cursor = "grab";
      e.preventDefault();
    }
    function up(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      spaceRef.current = false;
      if (containerRef.current) containerRef.current.style.cursor = "";
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ------------------------------------------------------------ coordinates
  /** Pointer → preview-canvas pixel coords (rect reflects the CSS transform). */
  const toPreviewCoords = useCallback((clientX: number, clientY: number) => {
    const stage = canvasRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * stage.width,
      y: ((clientY - rect.top) / rect.height) * stage.height,
    };
  }, []);

  const fullScale = useCallback(() => {
    const base = getBaseCanvas();
    const prev = getPreviewCanvas();
    if (!base || !prev) return 1;
    return base.width / prev.width;
  }, []);

  /**
   * Pointer → FULL-RES base coords: preview coords, undone through the live
   * geometry preview (rotation/flip aren't baked yet), scaled to the base.
   */
  const toBaseCoords = useCallback((clientX: number, clientY: number) => {
    const stage = canvasRef.current;
    const pt = toPreviewCoords(clientX, clientY);
    if (!stage || !pt) return null;
    const geom = usePhotoEditorStore.getState().params.geom;
    const inv = inverseGeometryPoint(pt.x, pt.y, stage.width, stage.height, geom);
    const fs = fullScale();
    return { x: inv.x * fs, y: inv.y * fs };
  }, [toPreviewCoords, fullScale]);

  const schedulePixelsChanged = useCallback(() => {
    cancelAnimationFrame(pixelsRafRef.current);
    pixelsRafRef.current = requestAnimationFrame(() => {
      usePhotoEditorStore.getState().notePixelsChanged();
    });
  }, []);

  // ------------------------------------------------------------ brush stamps
  const stampAt = useCallback((full: { x: number; y: number }, prevPt: { x: number; y: number }) => {
    const st = usePhotoEditorStore.getState();
    const base = getBaseCanvas();
    if (!base) return;
    const fs = fullScale();
    const r = Math.max(3, st.brushSize * fs);
    if (st.tool === "suavizar") {
      const mask = getMaskCanvas();
      if (mask) paintMaskStamp(mask.getContext("2d")!, full.x, full.y, r, false);
      return;
    }
    const ctx = base.getContext("2d", { willReadFrequently: true })!;
    switch (st.tool) {
      case "dodge": dodgeBurnStamp(ctx, full.x, full.y, r, st.brushStrength, "dodge"); break;
      case "burn": dodgeBurnStamp(ctx, full.x, full.y, r, st.brushStrength, "burn"); break;
      case "dentes": dodgeBurnStamp(ctx, full.x, full.y, r, st.brushStrength * 0.6, "dentes"); break;
      case "olhos": dodgeBurnStamp(ctx, full.x, full.y, r, st.brushStrength * 0.6, "olhos"); break;
      case "blur": blurStamp(ctx, full.x, full.y, r, st.brushStrength); break;
      case "sharpen": sharpenStamp(ctx, full.x, full.y, r, st.brushStrength); break;
      case "clone": {
        const off = strokeRef.current?.offset;
        if (off) cloneStamp(ctx, full.x, full.y, r, off.x, off.y, st.brushStrength);
        break;
      }
      case "borracha": {
        const key = strokeRef.current?.key;
        if (key) eraseColorStamp(ctx, full.x, full.y, r, key, st.eraseTolerance, st.brushStrength);
        break;
      }
      case "liquify":
        if (st.liquifyMode === "restaurar") {
          // pincel de restauração: volta aos pixels ORIGINAIS (exige mesmas dimensões)
          const orig = getOriginalCanvas();
          if (orig && orig.width === ctx.canvas.width && orig.height === ctx.canvas.height) {
            restoreStamp(ctx, orig, full.x, full.y, r * 1.4, st.brushStrength);
          }
        } else {
          liquifyStamp(ctx, full.x, full.y, r * 1.4, full.x - prevPt.x, full.y - prevPt.y, st.liquifyMode, st.brushStrength);
        }
        break;
      default:
        break;
    }
  }, [fullScale]);

  // ------------------------------------------------------------ pointer flow
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!s.hasImage || comparing) return;
    const panMode = tool === "mover" || spaceRef.current || e.button === 1;
    if (panMode) {
      panDragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || !BRUSH_TOOLS.includes(tool)) return;
    const full = toBaseCoords(e.clientX, e.clientY);
    if (!full) return;
    const fs = fullScale();
    const st = usePhotoEditorStore.getState();

    if (CLICK_TOOLS.includes(tool)) {
      const r = Math.max(4, st.brushSize * fs);
      st.applyPixelOp((b) => {
        const ctx = b.getContext("2d", { willReadFrequently: true })!;
        if (tool === "manchas") spotHealStamp(ctx, full.x, full.y, r);
        else redEyeStamp(ctx, full.x, full.y, r);
      });
      return;
    }

    if (tool === "clone" && !st.cloneSource) {
      st.setCloneSource(full);
      toast("Origem do carimbo definida", { description: "Agora pinte sobre a área de destino.", variant: "info" });
      return;
    }

    // stroke tools
    const stroke: NonNullable<typeof strokeRef.current> = { last: full, offset: null, key: null, painted: false };
    if (tool === "clone" && st.cloneSource) {
      stroke.offset = { x: full.x - st.cloneSource.x, y: full.y - st.cloneSource.y };
    }
    if (tool === "borracha") {
      const base = getBaseCanvas()!;
      const d = base.getContext("2d", { willReadFrequently: true })!
        .getImageData(Math.min(base.width - 1, Math.max(0, Math.round(full.x))), Math.min(base.height - 1, Math.max(0, Math.round(full.y))), 1, 1).data;
      stroke.key = { r: d[0], g: d[1], b: d[2] };
    }
    strokeRef.current = stroke;
    if (tool !== "suavizar") st.beginStroke(); // mask painting isn't a pixel edit — history happens on "Aplicar"
    stampAt(full, full);
    stroke.painted = true;
    if (tool === "suavizar") st.noteMaskChanged();
    else st.notePixelsChanged();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    // brush cursor preview (direct style mutation — no re-render per move)
    const cursor = cursorRef.current;
    if (cursor) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const d = brushSize * 2 * zoom;
        cursor.style.left = `${e.clientX - rect.left - d / 2}px`;
        cursor.style.top = `${e.clientY - rect.top - d / 2}px`;
        cursor.style.width = `${d}px`;
        cursor.style.height = `${d}px`;
      }
    }
    const drag = panDragRef.current;
    if (drag) {
      s.setPan({ x: drag.px + (e.clientX - drag.sx), y: drag.py + (e.clientY - drag.sy) });
      return;
    }
    const stroke = strokeRef.current;
    if (!stroke) return;
    const full = toBaseCoords(e.clientX, e.clientY);
    if (!full) return;
    const fs = fullScale();
    const st = usePhotoEditorStore.getState();
    if (tool === "liquify") {
      stampAt(full, stroke.last);
      stroke.last = full;
    } else {
      // interpolate stamps along the segment for a continuous stroke
      const r = Math.max(3, st.brushSize * fs);
      const dx = full.x - stroke.last.x;
      const dy = full.y - stroke.last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(2, r / 2.5);
      if (dist >= step) {
        const n = Math.min(24, Math.floor(dist / step));
        for (let i = 1; i <= n; i++) {
          stampAt({ x: stroke.last.x + (dx * i) / n, y: stroke.last.y + (dy * i) / n }, stroke.last);
        }
        stroke.last = full;
      }
    }
    if (tool === "suavizar") st.noteMaskChanged();
    else schedulePixelsChanged();
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    panDragRef.current = null;
    if (strokeRef.current) {
      strokeRef.current = null;
      if (tool !== "suavizar") usePhotoEditorStore.getState().notePixelsChanged();
    }
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  // ------------------------------------------------------ layer drag handles
  const showHandles = !comparing && tool === "mover" && (activeTab === "texto" || activeTab === "camadas");

  function dragLayer(e: ReactPointerEvent, id: string, start: { x: number; y: number }) {
    e.preventDefault();
    e.stopPropagation();
    const stage = canvasRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const st = usePhotoEditorStore.getState();
    st.selectLayer(id);
    function move(ev: PointerEvent) {
      st.updateLayer(id, {
        x: Math.min(1, Math.max(0, start.x + (ev.clientX - sx) / rect.width)),
        y: Math.min(1, Math.max(0, start.y + (ev.clientY - sy) / rect.height)),
      });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function layerKey(e: ReactKeyboardEvent, id: string, pos: { x: number; y: number }) {
    const step = e.shiftKey ? 0.05 : 0.01;
    let dx = 0, dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    e.preventDefault();
    usePhotoEditorStore.getState().updateLayer(id, {
      x: Math.min(1, Math.max(0, pos.x + dx)),
      y: Math.min(1, Math.max(0, pos.y + dy)),
    });
  }

  const showBrushCursor = !comparing && BRUSH_TOOLS.includes(tool);
  const prev = getPreviewCanvas();
  const stageW = prev?.width ?? 1;
  const stageH = prev?.height ?? 1;

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Área de edição da imagem — use a roda do mouse para zoom, espaço + arrastar para mover"
      className={cn(
        "relative min-h-[320px] flex-1 touch-none select-none overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40 shadow-[inset_0_0_120px_-40px_rgba(139,92,246,0.15)]",
        tool === "mover" ? "cursor-grab active:cursor-grabbing" : showBrushCursor ? "cursor-none" : "",
      )}
      style={{
        backgroundImage:
          "linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%), linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%)",
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 12px 12px",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (cursorRef.current) cursorRef.current.style.width = "0px";
      }}
    >
      <div
        ref={wrapRef}
        className="absolute left-0 top-0"
        style={{
          width: stageW,
          height: stageH,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <canvas ref={canvasRef} width={stageW} height={stageH} className="block" aria-label="Prévia da foto em edição" />
        <canvas ref={maskOverlayRef} className="pointer-events-none absolute left-0 top-0" style={{ width: "100%", height: "100%", display: "none" }} aria-hidden />

        {/* Draggable element-layer handles */}
        {showHandles && params.layers.map((l) => {
          if (!l.visible) return null;
          const label = l.kind === "texto" ? `texto "${l.text}"` : l.kind === "emoji" ? `emoji ${l.emoji}` : l.kind === "forma" ? "forma" : "marca d'água";
          return (
            <button
              key={l.id}
              onPointerDown={(e) => dragLayer(e, l.id, { x: l.x, y: l.y })}
              onKeyDown={(e) => layerKey(e, l.id, { x: l.x, y: l.y })}
              onClick={(e) => { e.stopPropagation(); s.selectLayer(l.id); }}
              aria-label={`Mover ${label} — setas para posicionar`}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded border-2 border-dashed px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                selectedLayerId === l.id ? "border-cyan-400/90" : "border-white/40",
              )}
              style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}
            />
          );
        })}

        {/* Crop overlay */}
        {activeTab === "recortar" && cropDraft && !comparing && (
          <CropOverlay stageRef={canvasRef} />
        )}
      </div>

      {/* Brush cursor preview */}
      {showBrushCursor && (
        <div
          ref={cursorRef}
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        />
      )}

      {/* Compare badge */}
      {comparing && (
        <span className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1 text-xs font-semibold text-amber-300">
          Antes (original)
        </span>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-white/[0.1] bg-surface-1/70 p-1 shadow-lg backdrop-blur-xl" role="group" aria-label="Controles de zoom">
        <button
          onClick={() => zoomAround(0.8)}
          aria-label="Diminuir zoom"
          className="rounded-lg p-1.5 text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[3.2rem] text-center font-mono text-xs text-zinc-400" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => zoomAround(1.25)}
          aria-label="Aumentar zoom"
          className="rounded-lg p-1.5 text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={fit}
          aria-label="Ajustar à tela"
          className="rounded-lg p-1.5 text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  /** Zoom keeping the viewport center stable. */
  function zoomAround(k: number) {
    const el = containerRef.current;
    if (!el) return;
    const st = usePhotoEditorStore.getState();
    const nz = Math.max(0.05, Math.min(8, st.zoom * k));
    const kk = nz / st.zoom;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    st.setZoom(nz);
    st.setPan({ x: cx - (cx - st.pan.x) * kk, y: cy - (cy - st.pan.y) * kk });
  }
}

// ---------------------------------------------------------------------------
// Crop overlay — normalized rect with 8 resize handles + move surface.
// ---------------------------------------------------------------------------

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

function CropOverlay({ stageRef }: { stageRef: React.RefObject<HTMLCanvasElement> }) {
  const cropDraft = usePhotoEditorStore((st) => st.cropDraft);
  const cropRatio = usePhotoEditorStore((st) => st.cropRatio);
  const imgW = usePhotoEditorStore((st) => st.imgW);
  const imgH = usePhotoEditorStore((st) => st.imgH);
  if (!cropDraft) return null;
  const r = cropDraft;

  function startDrag(e: ReactPointerEvent, handle: HandleId) {
    e.preventDefault();
    e.stopPropagation();
    const stage = stageRef.current;
    const st = usePhotoEditorStore.getState();
    const start = st.cropDraft;
    if (!stage || !start) return;
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const MIN = 0.04;
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - sx) / rect.width;
      const dy = (ev.clientY - sy) / rect.height;
      let { x, y, w, h } = start!;
      if (handle === "move") {
        x = Math.min(1 - w, Math.max(0, start!.x + dx));
        y = Math.min(1 - h, Math.max(0, start!.y + dy));
      } else {
        let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
        if (handle.includes("w")) x0 = clamp01(Math.min(x1 - MIN, start!.x + dx));
        if (handle.includes("e")) x1 = clamp01(Math.max(x0 + MIN, start!.x + start!.w + dx));
        if (handle.includes("n")) y0 = clamp01(Math.min(y1 - MIN, start!.y + dy));
        if (handle.includes("s")) y1 = clamp01(Math.max(y0 + MIN, start!.y + start!.h + dy));
        x = x0; y = y0; w = x1 - x0; h = y1 - y0;
        // Ratio lock (in PIXEL space, anchored opposite the dragged edge):
        // n/s handles derive width from height; all others derive height.
        const ratio = usePhotoEditorStore.getState().cropRatio;
        if (ratio && imgW > 0 && imgH > 0) {
          if (handle === "n" || handle === "s") {
            let nw = (h * imgH * ratio) / imgW;
            if (x + nw > 1) {
              const scale = (1 - x) / nw;
              nw *= scale;
              h *= scale;
              if (handle === "n") y = y1 - h;
            }
            w = nw;
          } else {
            let nh = (w * imgW) / ratio / imgH;
            if (y + nh > 1) {
              const scale = (1 - y) / nh;
              nh *= scale;
              w *= scale;
              if (handle.includes("w")) x = x1 - w;
            }
            if (handle.includes("n")) y = y1 - nh;
            h = nh;
          }
        }
      }
      usePhotoEditorStore.getState().setCropDraft({ x, y, w, h });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const handles: { id: HandleId; className: string; label: string }[] = [
    { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize", label: "canto superior esquerdo" },
    { id: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize", label: "borda superior" },
    { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize", label: "canto superior direito" },
    { id: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize", label: "borda direita" },
    { id: "se", className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize", label: "canto inferior direito" },
    { id: "s", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize", label: "borda inferior" },
    { id: "sw", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize", label: "canto inferior esquerdo" },
    { id: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize", label: "borda esquerda" },
  ];

  return (
    <div
      className="absolute border-2 border-cyan-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
      style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
      role="group"
      aria-label="Área de recorte"
      onPointerDown={(e) => startDrag(e, "move")}
    >
      {/* rule-of-thirds guides */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/3 top-0 h-full w-px bg-white/25" />
        <div className="absolute left-2/3 top-0 h-full w-px bg-white/25" />
        <div className="absolute left-0 top-1/3 h-px w-full bg-white/25" />
        <div className="absolute left-0 top-2/3 h-px w-full bg-white/25" />
      </div>
      {handles.map((h) => (
        <button
          key={h.id}
          onPointerDown={(e) => startDrag(e, h.id)}
          aria-label={`Redimensionar recorte — ${h.label}`}
          className={cn(
            "absolute h-3.5 w-3.5 touch-none rounded-full border border-black/50 bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            h.className,
          )}
        />
      ))}
    </div>
  );
}
