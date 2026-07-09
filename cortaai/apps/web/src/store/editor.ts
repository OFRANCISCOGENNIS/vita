"use client";

// Editor state with undo/redo history. Every user-visible edit goes through
// apply(), which snapshots the editable document (EditorDoc) into the past
// stack. Playback state (playhead, playing, zoom) is intentionally outside
// the history so undo never "rewinds the playhead".

import { create } from "zustand";
import type { CaptionPresetId, Cut } from "@/lib/types";
import {
  DEFAULT_AUDIO_ADVANCED,
  DEFAULT_CHROMA,
  DEFAULT_LAYERS_ANIM,
  DEFAULT_REFRAME,
  DEFAULT_SPEED,
  LOOKS,
  NEUTRAL_GRADE,
  NEUTRAL_LAYER_SAMPLE,
  layerAnimAt,
  type AudioAdvanced,
  type ChromaState,
  type ColorGrade,
  type LayerAnimId,
  type LayerKeyframe,
  type LayersAnim,
  type LookId,
  type MaskKind,
  type MaskRegion,
  type ReframeState,
  type SpeedState,
  type Transition,
  type TransitionType,
} from "@/lib/edit-visuals";

export type AspectRatio = "9:16" | "1:1" | "16:9" | "4:5";
export type PlatformPresetId = "tiktok" | "reels" | "shorts";

export interface CaptionStyle {
  font: string;
  color: string;
  outline: boolean;
  shadow: boolean;
  position: "topo" | "centro" | "rodapé";
  animation: "nenhuma" | "pop" | "slide" | "karaokê";
  sizePx: number;
  highlightKeywords: boolean;
  censorProfanity: boolean;
}

export interface LayersState {
  headlineEnabled: boolean;
  headlineText: string;
  watermarkEnabled: boolean;
  progressBarEnabled: boolean;
  stickersEnabled: boolean;
  autoZoomPunch: boolean;
  transition: "nenhuma" | "corte seco" | "zoom" | "slide";
}

export interface AudioState {
  normalizeLufs: boolean; // -14 LUFS
  removeSilence: boolean; // silence + filler words ("é...", "tipo")
  ducking: boolean;
  musicTrack: string | null;
}

/** The undoable document. */
export interface EditorDoc {
  aspect: AspectRatio;
  platformPreset: PlatformPresetId | null;
  captionPreset: CaptionPresetId;
  captionStyle: CaptionStyle;
  layers: LayersState;
  audio: AudioState;
  inPoint: number | null; // relative seconds within the cut
  outPoint: number | null;
  splits: number[];
  removedSentenceKeys: string[]; // text-based editing: removed transcript sentences
  // --- advanced editing (fase 2) ---
  colorGrade: ColorGrade;
  speed: SpeedState;
  reframe: ReframeState;
  chroma: ChromaState;
  layersAnim: LayersAnim;
  transitions: Transition[];
  masks: MaskRegion[];
  audioAdvanced: AudioAdvanced;
}

export interface EditorVersion {
  label: string;
  at: string;
  doc: EditorDoc;
}

interface EditorState {
  cut: Cut | null;
  doc: EditorDoc;
  past: EditorDoc[];
  future: EditorDoc[];
  playing: boolean;
  currentTime: number; // seconds relative to cut start
  timelineZoom: number; // px per second
  dirty: boolean;
  savedAt: string | null;
  versions: EditorVersion[];
  // Transient preview-overlay UI (outside history, like playback state).
  overlayMode: "none" | "reframe" | "masks";
  selectedMaskId: string | null;

  loadCut: (cut: Cut) => void;
  apply: (patch: Partial<EditorDoc>) => void;
  undo: () => void;
  redo: () => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  seek: (t: number) => void;
  setTimelineZoom: (z: number) => void;
  splitAtPlayhead: () => void;
  toggleSentenceRemoved: (key: string) => void;
  markSaved: (label?: string) => void;
  restoreVersion: (index: number) => void;
  // --- advanced editing actions (all undoable via apply) ---
  setColorGrade: (patch: Partial<ColorGrade>) => void;
  applyLook: (id: LookId) => void;
  resetColorGrade: () => void;
  setSpeed: (patch: Partial<SpeedState>) => void;
  addSpeedKeyframe: () => void;
  removeSpeedKeyframe: (t: number) => void;
  setReframe: (patch: Partial<ReframeState>) => void;
  addReframeKeyframe: () => void;
  removeReframeKeyframe: (t: number) => void;
  setChroma: (patch: Partial<ChromaState>) => void;
  addLayerKeyframe: (layer: LayerAnimId) => void;
  updateLayerKeyframe: (layer: LayerAnimId, index: number, patch: Partial<LayerKeyframe>) => void;
  removeLayerKeyframe: (layer: LayerAnimId, index: number) => void;
  setTransition: (at: number, type: TransitionType, duration?: number) => void;
  removeTransition: (at: number) => void;
  addMask: (kind: MaskKind) => void;
  updateMask: (id: string, patch: Partial<MaskRegion>) => void;
  removeMask: (id: string) => void;
  setAudioAdvanced: (patch: Partial<AudioAdvanced>) => void;
  setOverlayMode: (mode: "none" | "reframe" | "masks") => void;
  setSelectedMaskId: (id: string | null) => void;
}

const DEFAULT_DOC: EditorDoc = {
  aspect: "9:16",
  platformPreset: "tiktok",
  captionPreset: "hormozi",
  captionStyle: {
    font: "Inter",
    color: "#facc15",
    outline: true,
    shadow: true,
    position: "centro",
    animation: "pop",
    sizePx: 34,
    highlightKeywords: true,
    censorProfanity: false,
  },
  layers: {
    headlineEnabled: true,
    headlineText: "",
    watermarkEnabled: true,
    progressBarEnabled: true,
    stickersEnabled: false,
    autoZoomPunch: true,
    transition: "zoom",
  },
  audio: {
    normalizeLufs: true,
    removeSilence: true,
    ducking: true,
    musicTrack: null,
  },
  inPoint: null,
  outPoint: null,
  splits: [],
  removedSentenceKeys: [],
  colorGrade: NEUTRAL_GRADE,
  speed: DEFAULT_SPEED,
  reframe: DEFAULT_REFRAME,
  chroma: DEFAULT_CHROMA,
  layersAnim: DEFAULT_LAYERS_ANIM,
  transitions: [],
  masks: [],
  audioAdvanced: DEFAULT_AUDIO_ADVANCED,
};

const HISTORY_LIMIT = 60;

const uidShort = () => Math.random().toString(36).slice(2, 9);

export const useEditorStore = create<EditorState>((set, get) => ({
  cut: null,
  doc: DEFAULT_DOC,
  past: [],
  future: [],
  playing: false,
  currentTime: 0,
  timelineZoom: 14,
  dirty: false,
  savedAt: null,
  versions: [],
  overlayMode: "none",
  selectedMaskId: null,

  loadCut: (cut) =>
    set({
      cut,
      doc: {
        ...DEFAULT_DOC,
        layers: { ...DEFAULT_DOC.layers, headlineText: cut.title },
        audio: { ...DEFAULT_DOC.audio, musicTrack: cut.suggestedSound.track },
      },
      past: [],
      future: [],
      playing: false,
      currentTime: 0,
      dirty: false,
      savedAt: new Date().toISOString(),
      overlayMode: "none",
      selectedMaskId: null,
      versions: [
        {
          label: "Versão inicial (sugestão da IA)",
          at: new Date().toISOString(),
          doc: DEFAULT_DOC,
        },
      ],
    }),

  apply: (patch) =>
    set((s) => ({
      past: [...s.past.slice(-HISTORY_LIMIT + 1), s.doc],
      future: [],
      doc: { ...s.doc, ...patch },
      dirty: true,
    })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future],
        doc: previous,
        dirty: true,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.doc], future: rest, doc: next, dirty: true };
    }),

  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (p) => set({ playing: p }),
  seek: (t) => {
    const { cut } = get();
    const max = cut ? cut.endSeconds - cut.startSeconds : 0;
    set({ currentTime: Math.min(Math.max(0, t), max) });
  },
  setTimelineZoom: (z) => set({ timelineZoom: Math.min(60, Math.max(4, z)) }),

  splitAtPlayhead: () => {
    const { currentTime, doc, apply } = get();
    const t = Math.round(currentTime * 10) / 10;
    if (t <= 0 || doc.splits.includes(t)) return;
    apply({ splits: [...doc.splits, t].sort((a, b) => a - b) });
  },

  toggleSentenceRemoved: (key) => {
    const { doc, apply } = get();
    const removed = doc.removedSentenceKeys.includes(key)
      ? doc.removedSentenceKeys.filter((k) => k !== key)
      : [...doc.removedSentenceKeys, key];
    apply({ removedSentenceKeys: removed });
  },

  markSaved: (label) =>
    set((s) => ({
      dirty: false,
      savedAt: new Date().toISOString(),
      versions: label
        ? [...s.versions, { label, at: new Date().toISOString(), doc: s.doc }]
        : s.versions,
    })),

  restoreVersion: (index) =>
    set((s) => {
      const v = s.versions[index];
      if (!v) return s;
      return { past: [...s.past, s.doc], future: [], doc: v.doc, dirty: true };
    }),

  // ---------------------------------------------------------------- color grade
  setColorGrade: (patch) => {
    const { doc, apply } = get();
    // Moving a slider detaches from the named look (values are now custom).
    apply({ colorGrade: { ...doc.colorGrade, ...patch, look: null } });
  },
  applyLook: (id) => {
    const { doc, apply } = get();
    const look = LOOKS.find((l) => l.id === id);
    if (!look) return;
    apply({ colorGrade: { ...look.values, look: id } });
  },
  resetColorGrade: () => get().apply({ colorGrade: { ...NEUTRAL_GRADE } }),

  // ---------------------------------------------------------------- speed
  setSpeed: (patch) => {
    const { doc, apply } = get();
    apply({ speed: { ...doc.speed, ...patch } });
  },
  addSpeedKeyframe: () => {
    const { doc, currentTime, apply } = get();
    const t = Math.round(currentTime * 10) / 10;
    const keyframes = [
      ...doc.speed.keyframes.filter((k) => Math.abs(k.t - t) > 0.05),
      { t, rate: doc.speed.rate },
    ].sort((a, b) => a.t - b.t);
    apply({ speed: { ...doc.speed, keyframes } });
  },
  removeSpeedKeyframe: (t) => {
    const { doc, apply } = get();
    apply({ speed: { ...doc.speed, keyframes: doc.speed.keyframes.filter((k) => k.t !== t) } });
  },

  // ---------------------------------------------------------------- reframe
  setReframe: (patch) => {
    const { doc, apply } = get();
    apply({ reframe: { ...doc.reframe, ...patch } });
  },
  addReframeKeyframe: () => {
    const { doc, currentTime, apply } = get();
    const t = Math.round(currentTime * 10) / 10;
    const { zoom, panX, panY, rotation } = doc.reframe;
    const keyframes = [
      ...doc.reframe.keyframes.filter((k) => Math.abs(k.t - t) > 0.05),
      { t, zoom, panX, panY, rotation },
    ].sort((a, b) => a.t - b.t);
    apply({ reframe: { ...doc.reframe, keyframes } });
  },
  removeReframeKeyframe: (t) => {
    const { doc, apply } = get();
    apply({ reframe: { ...doc.reframe, keyframes: doc.reframe.keyframes.filter((k) => k.t !== t) } });
  },

  // ---------------------------------------------------------------- chroma
  setChroma: (patch) => {
    const { doc, apply } = get();
    apply({ chroma: { ...doc.chroma, ...patch } });
  },

  // ---------------------------------------------------------------- layer keyframes
  addLayerKeyframe: (layer) => {
    const { doc, currentTime, apply } = get();
    const t = Math.round(currentTime * 10) / 10;
    // Capture the currently-interpolated pose so the new keyframe is seamless.
    const current = layerAnimAt(doc.layersAnim[layer], t) ?? NEUTRAL_LAYER_SAMPLE;
    const kf: LayerKeyframe = { t, ...current, ease: "easeInOut" };
    const keyframes = [
      ...doc.layersAnim[layer].filter((k) => Math.abs(k.t - t) > 0.05),
      kf,
    ].sort((a, b) => a.t - b.t);
    apply({ layersAnim: { ...doc.layersAnim, [layer]: keyframes } });
  },
  updateLayerKeyframe: (layer, index, patch) => {
    const { doc, apply } = get();
    const keyframes = doc.layersAnim[layer].map((k, i) => (i === index ? { ...k, ...patch } : k));
    apply({ layersAnim: { ...doc.layersAnim, [layer]: keyframes } });
  },
  removeLayerKeyframe: (layer, index) => {
    const { doc, apply } = get();
    const keyframes = doc.layersAnim[layer].filter((_, i) => i !== index);
    apply({ layersAnim: { ...doc.layersAnim, [layer]: keyframes } });
  },

  // ---------------------------------------------------------------- transitions
  setTransition: (at, type, duration = 0.5) => {
    const { doc, apply } = get();
    const transitions = [
      ...doc.transitions.filter((tr) => tr.at !== at),
      { at, type, duration },
    ].sort((a, b) => a.at - b.at);
    apply({ transitions });
  },
  removeTransition: (at) => {
    const { doc, apply } = get();
    apply({ transitions: doc.transitions.filter((tr) => tr.at !== at) });
  },

  // ---------------------------------------------------------------- masks
  addMask: (kind) => {
    const { doc, apply } = get();
    const mask: MaskRegion = {
      id: uidShort(),
      kind,
      shape: kind === "spotlight" ? "ellipse" : "rect",
      x: 0.32,
      y: 0.34,
      w: 0.36,
      h: 0.28,
      intensity: 60,
    };
    apply({ masks: [...doc.masks, mask] });
  },
  updateMask: (id, patch) => {
    const { doc, apply } = get();
    apply({ masks: doc.masks.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  },
  removeMask: (id) => {
    const { doc, apply } = get();
    apply({ masks: doc.masks.filter((m) => m.id !== id) });
  },

  // ---------------------------------------------------------------- audio
  setAudioAdvanced: (patch) => {
    const { doc, apply } = get();
    apply({ audioAdvanced: { ...doc.audioAdvanced, ...patch } });
  },

  setOverlayMode: (mode) => set({ overlayMode: mode }),
  setSelectedMaskId: (id) => set({ selectedMaskId: id }),
}));
