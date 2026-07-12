"use client";

// Editor de Fotos — state store.
//
// Pixel data (full-res base canvas, preview mirror, undo snapshots) lives in a
// MODULE-LEVEL document, not inside zustand: canvases aren't serializable and
// putting multi-MB buffers through the store would make every set() expensive.
// The store keeps a `version` counter that bumps whenever pixels change, so
// React components re-render and re-read the canvases through the getters.
//
// History model (undo/redo):
//  - Every entry = { params, pixels }: params are always deep-cloned (cheap,
//    plain JSON), pixels is a SNAPSHOT object shared by reference between
//    consecutive entries whenever the pixels didn't change — param-only edits
//    cost zero pixel memory.
//  - Snapshots larger than ~2MP are DOWNSCALED to cap memory (30 entries ×
//    2MP × 4B ≈ 240MB worst case; in practice far less thanks to sharing).
//    Restoring such an entry upscales back — a documented lossy trade-off.
//  - Slider drags coalesce into a single history entry via a debounce: the
//    first change after idle pushes the pre-change state, further changes
//    within 700ms reuse it.
//
// Only user presets are persisted (cortaai-photo-presets) — never pixel data.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  NEUTRAL_GEOM,
  bakeGeometry,
  cloneCanvas,
  downscaleToMax,
  drawElementLayer,
  makeCanvas,
  neutralParams,
  type Adjustments,
  type CurvesState,
  type ElementLayer,
  type FilterState,
  type HslState,
  type LevelsState,
  type LiquifyMode,
  type PhotoParams,
  type Histogram,
} from "@/lib/photo-engine";

export const PREVIEW_MAX_PIXELS = 1_400_000; // live edits run at ~1.4MP
const SNAPSHOT_MAX_PIXELS = 2_000_000; // undo snapshots capped at ~2MP
const HISTORY_LIMIT = 30;
const SOURCE_MAX_PIXELS = 24_000_000; // safety cap for gigantic uploads

// sessionStorage keys for the light capa ⇄ fotos handoff
export const HANDOFF_TO_FOTOS = "cortaai-foto-handoff";
export const HANDOFF_TO_CAPA = "cortaai-capa-handoff";

export type FotosTab =
  | "ajustes" | "curvas" | "cor" | "recortar" | "retoque"
  | "pinceis" | "filtros" | "texto" | "camadas";

export type ToolId =
  | "mover"
  // retoque
  | "suavizar" | "manchas" | "dentes" | "olhos" | "olhos-vermelhos" | "liquify"
  // pincéis
  | "blur" | "sharpen" | "dodge" | "burn" | "clone" | "borracha";

/** Tools that paint continuously while dragging. */
export const STROKE_TOOLS: ToolId[] = [
  "suavizar", "dentes", "olhos", "liquify", "blur", "sharpen", "dodge", "burn", "clone", "borracha",
];
/** Tools that act on a single click. */
export const CLICK_TOOLS: ToolId[] = ["manchas", "olhos-vermelhos"];

// ---------------------------------------------------------------------------
// Module-level pixel document
// ---------------------------------------------------------------------------

interface PixelSnapshot { canvas: HTMLCanvasElement; w: number; h: number }
interface HistoryEntry { params: PhotoParams; pixels: PixelSnapshot | null }

const doc = {
  base: null as HTMLCanvasElement | null, // full-res current pixels
  original: null as HTMLCanvasElement | null, // as-loaded (for "antes")
  preview: null as HTMLCanvasElement | null, // cached ≤1.4MP mirror of base
  mask: null as HTMLCanvasElement | null, // skin-smooth paint mask (base dims)
  snapCache: null as PixelSnapshot | null, // last snapshot of current pixels
  past: [] as HistoryEntry[],
  future: [] as HistoryEntry[],
};

/**
 * Shared, non-reactive render byproducts. The stage writes the histogram of
 * the last rendered frame here and pings `listeners` — the Curvas panel
 * subscribes without forcing store-wide re-renders.
 */
export const renderShared: { histogram: Histogram | null; listeners: Set<() => void> } = {
  histogram: null,
  listeners: new Set(),
};

export function getBaseCanvas(): HTMLCanvasElement | null {
  return doc.base;
}
export function getOriginalCanvas(): HTMLCanvasElement | null {
  return doc.original;
}
/** Lazily (re)computes the downscaled preview mirror of the base pixels. */
export function getPreviewCanvas(): HTMLCanvasElement | null {
  if (!doc.base) return null;
  if (!doc.preview) doc.preview = downscaleToMax(doc.base, PREVIEW_MAX_PIXELS);
  return doc.preview;
}
/** Skin-smoothing mask at base resolution (created/resized on demand). */
export function getMaskCanvas(): HTMLCanvasElement | null {
  if (!doc.base) return null;
  if (!doc.mask || doc.mask.width !== doc.base.width || doc.mask.height !== doc.base.height) {
    doc.mask = makeCanvas(doc.base.width, doc.base.height);
  }
  return doc.mask;
}

function cloneParams(p: PhotoParams): PhotoParams {
  return JSON.parse(JSON.stringify(p)) as PhotoParams;
}

function snapshotPixels(): PixelSnapshot | null {
  if (!doc.base) return null;
  if (!doc.snapCache) {
    doc.snapCache = {
      canvas: downscaleToMax(doc.base, SNAPSHOT_MAX_PIXELS),
      w: doc.base.width,
      h: doc.base.height,
    };
  }
  return doc.snapCache;
}

function restorePixels(snap: PixelSnapshot | null): void {
  if (!snap || snap === doc.snapCache) return;
  const base = makeCanvas(snap.w, snap.h);
  const ctx = base.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(snap.canvas, 0, 0, snap.w, snap.h);
  doc.base = base;
  doc.preview = null;
  doc.snapCache = snap;
}

// Debounced history for slider drags (one entry per burst of changes).
let historyOpen = false;
let historyTimer: ReturnType<typeof setTimeout> | null = null;
function closeHistoryBurst(): void {
  historyOpen = false;
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface PhotoEditorState {
  hasImage: boolean;
  imgW: number;
  imgH: number;
  params: PhotoParams;
  /** Bumps whenever base pixels change (canvases live outside the store). */
  version: number;
  pastCount: number;
  futureCount: number;
  busy: string | null; // label shown while a heavy full-res op runs

  activeTab: FotosTab;
  tool: ToolId;
  brushSize: number; // preview px (radius)
  brushStrength: number; // 0..100
  liquifyMode: LiquifyMode;
  eraseTolerance: number; // 0..100 (borracha de fundo)
  smoothAmount: number; // 0..100 (suavizar pele)
  cloneSource: { x: number; y: number } | null; // full-res coords
  maskVersion: number; // bumps when the smoothing mask is painted/cleared

  zoom: number; // stage scale (1 = 100% of preview px)
  pan: { x: number; y: number };
  fitRequest: number; // stage recomputes fit when this bumps
  comparing: boolean;
  selectedLayerId: string | null;
  cropDraft: { x: number; y: number; w: number; h: number } | null; // 0..1
  cropRatio: number | null; // w/h lock

  loadImage: (source: HTMLImageElement | HTMLCanvasElement) => void;
  closeImage: () => void;
  updateParams: (patch: Partial<PhotoParams>, history?: "debounce" | "push" | "none") => void;
  setAdj: (patch: Partial<Adjustments>) => void;
  setCurves: (curves: CurvesState) => void;
  setLevels: (levels: LevelsState) => void;
  setHsl: (hsl: HslState) => void;
  setFilter: (filter: FilterState) => void;
  setGeom: (patch: Partial<PhotoParams["geom"]>) => void;
  resetAdjustments: () => void;
  applyPreset: (p: { adj: Adjustments; curves: CurvesState; levels: LevelsState; hsl: HslState; filter: FilterState }) => void;

  /** Destructive pixel operation: snapshots history, then mutates/replaces the base. */
  applyPixelOp: (fn: (base: HTMLCanvasElement) => HTMLCanvasElement | void, paramsPatch?: Partial<PhotoParams>) => void;
  /** Push one history entry at brush-stroke start; stamps then mutate the base directly. */
  beginStroke: () => void;
  /** Invalidate caches + re-render after direct base mutations (during strokes). */
  notePixelsChanged: () => void;
  noteMaskChanged: () => void;
  clearMask: () => void;
  undo: () => void;
  redo: () => void;

  addLayer: (layer: ElementLayer) => void;
  updateLayer: (id: string, patch: Partial<ElementLayer>) => void;
  removeLayer: (id: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
  flattenLayers: () => void;
  selectLayer: (id: string | null) => void;

  setActiveTab: (tab: FotosTab) => void;
  setTool: (tool: ToolId) => void;
  setBrushSize: (v: number) => void;
  setBrushStrength: (v: number) => void;
  setLiquifyMode: (m: LiquifyMode) => void;
  setEraseTolerance: (v: number) => void;
  setSmoothAmount: (v: number) => void;
  setCloneSource: (p: { x: number; y: number } | null) => void;
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;
  requestFit: () => void;
  setComparing: (v: boolean) => void;
  setCropDraft: (r: { x: number; y: number; w: number; h: number } | null) => void;
  setCropRatio: (r: number | null) => void;
  setBusy: (label: string | null) => void;
}

/** Default tool when entering each tab. */
const TAB_DEFAULT_TOOL: Partial<Record<FotosTab, ToolId>> = {
  retoque: "suavizar",
  pinceis: "blur",
};

export const usePhotoEditorStore = create<PhotoEditorState>((set, get) => {
  function pushPast(entry: HistoryEntry): void {
    doc.past.push(entry);
    if (doc.past.length > HISTORY_LIMIT) doc.past.shift();
    doc.future = [];
  }

  function captureCurrent(): HistoryEntry {
    return { params: cloneParams(get().params), pixels: snapshotPixels() };
  }

  return {
    hasImage: false,
    imgW: 0,
    imgH: 0,
    params: neutralParams(),
    version: 0,
    pastCount: 0,
    futureCount: 0,
    busy: null,

    activeTab: "ajustes",
    tool: "mover",
    brushSize: 36,
    brushStrength: 60,
    liquifyMode: "empurrar",
    eraseTolerance: 32,
    smoothAmount: 55,
    cloneSource: null,
    maskVersion: 0,

    zoom: 1,
    pan: { x: 0, y: 0 },
    fitRequest: 0,
    comparing: false,
    selectedLayerId: null,
    cropDraft: null,
    cropRatio: null,

    loadImage: (source) => {
      doc.base = downscaleToMax(source, SOURCE_MAX_PIXELS);
      doc.original = cloneCanvas(doc.base);
      doc.preview = null;
      doc.mask = null;
      doc.snapCache = null;
      doc.past = [];
      doc.future = [];
      closeHistoryBurst();
      set((s) => ({
        hasImage: true,
        imgW: doc.base!.width,
        imgH: doc.base!.height,
        params: neutralParams(),
        version: s.version + 1,
        pastCount: 0,
        futureCount: 0,
        activeTab: "ajustes",
        tool: "mover",
        cloneSource: null,
        maskVersion: 0,
        comparing: false,
        selectedLayerId: null,
        cropDraft: null,
        fitRequest: s.fitRequest + 1,
        busy: null,
      }));
    },

    closeImage: () => {
      doc.base = null;
      doc.original = null;
      doc.preview = null;
      doc.mask = null;
      doc.snapCache = null;
      doc.past = [];
      doc.future = [];
      closeHistoryBurst();
      renderShared.histogram = null;
      set((s) => ({
        hasImage: false, imgW: 0, imgH: 0, params: neutralParams(),
        version: s.version + 1, pastCount: 0, futureCount: 0,
        comparing: false, selectedLayerId: null, cropDraft: null, busy: null,
      }));
    },

    updateParams: (patch, history = "debounce") => {
      if (history === "push") {
        pushPast(captureCurrent());
        closeHistoryBurst();
      } else if (history === "debounce") {
        // First change after idle snapshots the pre-change state once.
        if (!historyOpen) {
          pushPast(captureCurrent());
          historyOpen = true;
        }
        if (historyTimer) clearTimeout(historyTimer);
        historyTimer = setTimeout(() => {
          historyOpen = false;
          historyTimer = null;
        }, 700);
      }
      set((s) => ({
        params: { ...s.params, ...patch },
        pastCount: doc.past.length,
        futureCount: doc.future.length,
      }));
    },

    setAdj: (patch) => {
      const { params, updateParams } = get();
      updateParams({ adj: { ...params.adj, ...patch } });
    },
    setCurves: (curves) => get().updateParams({ curves }),
    setLevels: (levels) => get().updateParams({ levels }),
    setHsl: (hsl) => get().updateParams({ hsl }),
    setFilter: (filter) => get().updateParams({ filter }),
    setGeom: (patch) => {
      const { params, updateParams } = get();
      updateParams({ geom: { ...params.geom, ...patch } });
    },
    resetAdjustments: () => {
      const n = neutralParams();
      get().updateParams(
        { adj: n.adj, curves: n.curves, levels: n.levels, hsl: n.hsl, filter: n.filter },
        "push",
      );
    },
    applyPreset: (p) => {
      get().updateParams(
        {
          adj: { ...p.adj },
          curves: JSON.parse(JSON.stringify(p.curves)) as CurvesState,
          levels: { ...p.levels },
          hsl: JSON.parse(JSON.stringify(p.hsl)) as HslState,
          filter: { ...p.filter },
        },
        "push",
      );
    },

    applyPixelOp: (fn, paramsPatch) => {
      if (!doc.base) return;
      pushPast(captureCurrent());
      closeHistoryBurst();
      const res = fn(doc.base);
      if (res && res !== doc.base) doc.base = res;
      doc.preview = null;
      doc.snapCache = null;
      set((s) => ({
        ...(paramsPatch ? { params: { ...s.params, ...paramsPatch } } : {}),
        imgW: doc.base!.width,
        imgH: doc.base!.height,
        version: s.version + 1,
        pastCount: doc.past.length,
        futureCount: doc.future.length,
        cropDraft: null,
      }));
    },

    beginStroke: () => {
      if (!doc.base) return;
      pushPast(captureCurrent());
      closeHistoryBurst();
      set({ pastCount: doc.past.length, futureCount: doc.future.length });
    },

    notePixelsChanged: () => {
      doc.preview = null;
      doc.snapCache = null;
      set((s) => ({ version: s.version + 1 }));
    },

    noteMaskChanged: () => set((s) => ({ maskVersion: s.maskVersion + 1 })),
    clearMask: () => {
      const mask = getMaskCanvas();
      if (mask) mask.getContext("2d")!.clearRect(0, 0, mask.width, mask.height);
      set((s) => ({ maskVersion: s.maskVersion + 1 }));
    },

    undo: () => {
      const entry = doc.past.pop();
      if (!entry) return;
      doc.future.unshift(captureCurrent());
      if (doc.future.length > HISTORY_LIMIT) doc.future.pop();
      closeHistoryBurst();
      restorePixels(entry.pixels);
      set((s) => ({
        params: cloneParams(entry.params),
        imgW: doc.base?.width ?? 0,
        imgH: doc.base?.height ?? 0,
        version: s.version + 1,
        pastCount: doc.past.length,
        futureCount: doc.future.length,
        cropDraft: null,
      }));
    },

    redo: () => {
      const entry = doc.future.shift();
      if (!entry) return;
      doc.past.push(captureCurrent());
      if (doc.past.length > HISTORY_LIMIT) doc.past.shift();
      closeHistoryBurst();
      restorePixels(entry.pixels);
      set((s) => ({
        params: cloneParams(entry.params),
        imgW: doc.base?.width ?? 0,
        imgH: doc.base?.height ?? 0,
        version: s.version + 1,
        pastCount: doc.past.length,
        futureCount: doc.future.length,
        cropDraft: null,
      }));
    },

    addLayer: (layer) => {
      const { params, updateParams } = get();
      updateParams({ layers: [...params.layers, layer] }, "push");
      set({ selectedLayerId: layer.id });
    },
    updateLayer: (id, patch) => {
      const { params, updateParams } = get();
      updateParams({
        layers: params.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as ElementLayer) : l)),
      });
    },
    removeLayer: (id) => {
      const { params, updateParams, selectedLayerId } = get();
      updateParams({ layers: params.layers.filter((l) => l.id !== id) }, "push");
      if (selectedLayerId === id) set({ selectedLayerId: null });
    },
    moveLayer: (id, dir) => {
      const { params, updateParams } = get();
      const idx = params.layers.findIndex((l) => l.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= params.layers.length) return;
      const layers = [...params.layers];
      const [item] = layers.splice(idx, 1);
      layers.splice(to, 0, item);
      updateParams({ layers }, "push");
    },
    flattenLayers: () => {
      const { params, applyPixelOp } = get();
      if (params.layers.length === 0 || !doc.base) return;
      // Layer positions live in geometry-rendered space, so any live rotation/
      // flip is baked first; then the elements are drawn into the pixels.
      // (Flattened elements will also receive the parametric adjustments —
      // stated in the UI.)
      const layers = params.layers;
      const geom = { ...params.geom };
      applyPixelOp((base) => {
        const baked = bakeGeometry(base, geom);
        const ctx = baked.getContext("2d")!;
        for (const layer of layers) {
          if (layer.visible) drawElementLayer(ctx, baked.width, baked.height, layer);
        }
        return baked;
      }, { layers: [], geom: { ...NEUTRAL_GEOM } });
      set({ selectedLayerId: null });
    },
    selectLayer: (id) => set({ selectedLayerId: id }),

    setActiveTab: (tab) => {
      const tool = TAB_DEFAULT_TOOL[tab] ?? "mover";
      set({ activeTab: tab, tool, cropDraft: tab === "recortar" ? get().cropDraft : null });
    },
    setTool: (tool) => set({ tool }),
    setBrushSize: (v) => set({ brushSize: Math.max(4, Math.min(200, v)) }),
    setBrushStrength: (v) => set({ brushStrength: Math.max(1, Math.min(100, v)) }),
    setLiquifyMode: (m) => set({ liquifyMode: m }),
    setEraseTolerance: (v) => set({ eraseTolerance: v }),
    setSmoothAmount: (v) => set({ smoothAmount: v }),
    setCloneSource: (p) => set({ cloneSource: p }),
    setZoom: (z) => set({ zoom: Math.max(0.05, Math.min(8, z)) }),
    setPan: (p) => set({ pan: p }),
    requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
    setComparing: (v) => set({ comparing: v }),
    setCropDraft: (r) => set({ cropDraft: r }),
    setCropRatio: (r) => set({ cropRatio: r }),
    setBusy: (label) => set({ busy: label }),
  };
});

// ---------------------------------------------------------------------------
// User presets — the ONLY persisted slice (never pixel data).
// ---------------------------------------------------------------------------

export interface PhotoPreset {
  id: string;
  name: string;
  adj: Adjustments;
  curves: CurvesState;
  levels: LevelsState;
  hsl: HslState;
  filter: FilterState;
  createdAt: string;
}

interface PhotoPresetsState {
  presets: PhotoPreset[];
  hydrated: boolean;
  save: (name: string, params: PhotoParams) => void;
  remove: (id: string) => void;
  setHydrated: () => void;
}

export const usePhotoPresetsStore = create<PhotoPresetsState>()(
  persist(
    (set) => ({
      presets: [],
      hydrated: false,
      save: (name, params) =>
        set((s) => ({
          presets: [
            {
              id: `pp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              name,
              adj: { ...params.adj },
              curves: JSON.parse(JSON.stringify(params.curves)) as CurvesState,
              levels: { ...params.levels },
              hsl: JSON.parse(JSON.stringify(params.hsl)) as HslState,
              filter: { ...params.filter },
              createdAt: new Date().toISOString(),
            },
            ...s.presets,
          ].slice(0, 24),
        })),
      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "cortaai-photo-presets",
      partialize: (s) => ({ presets: s.presets }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
