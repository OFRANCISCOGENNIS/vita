"use client";

// Editor state with undo/redo history. Every user-visible edit goes through
// apply(), which snapshots the editable document (EditorDoc) into the past
// stack. Playback state (playhead, playing, zoom) is intentionally outside
// the history so undo never "rewinds the playhead".

import { create } from "zustand";
import type { CaptionPresetId, Cut } from "@/lib/types";

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
};

const HISTORY_LIMIT = 60;

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
}));
