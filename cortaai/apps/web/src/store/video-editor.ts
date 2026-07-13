"use client";

// Store do editor multitrilha (Zustand). Separa estritamente:
//  - `project`: MODELO serializável (fonte da verdade), com histórico undo/redo.
//  - view state (playhead, zoom, seleção): transiente, fora do histórico.
// A UI só chama ações; nunca muta o projeto diretamente.

import { create } from "zustand";
import {
  makeClip,
  makeProject,
  validateProject,
  type Clip,
  type MakeClipInput,
  type Project,
  type Track,
  type TrackType,
  makeTrack,
} from "@/lib/video-editor/model";
import { placeClip, projectDurationMs, splitClipAt, trimClipStart, trimClipEnd } from "@/lib/video-editor/timeline-math";
import type { MediaSource } from "@/lib/video-editor/media-registry";
import { IMAGE_DEFAULT_MS } from "@/lib/video-editor/media-registry";

const HISTORY_LIMIT = 60;

interface VideoEditorState {
  project: Project;
  past: Project[];
  future: Project[];
  // fontes de mídia importadas (metadados; blobs no IndexedDB)
  sources: Record<string, MediaSource>;
  // view state (transiente)
  playheadMs: number;
  pxPerSecond: number;
  selectedClipId: string | null;

  // seleção / navegação
  select: (clipId: string | null) => void;
  setPlayhead: (ms: number) => void;
  setZoom: (pxPerSecond: number) => void;

  // projeto
  loadProject: (project: Project) => void;
  loadFromJson: (json: unknown) => boolean;
  toJson: () => string;
  durationMs: () => number;

  // mídias
  addSource: (source: MediaSource) => void;
  getSource: (sourceId: string) => MediaSource | undefined;
  /** Adiciona a fonte ao fim da trilha compatível, criando um clipe. */
  addClipFromSource: (source: MediaSource) => string;

  // trilhas / clipes (todas produzem histórico)
  addTrack: (type: TrackType, name?: string) => string;
  addClip: (input: MakeClipInput) => string;
  moveClip: (clipId: string, newStartMs: number) => void;
  splitAtPlayhead: () => void;
  trimStart: (clipId: string, newStartMs: number, sourceDurationMs: number) => void;
  trimEnd: (clipId: string, newEndMs: number, sourceDurationMs: number) => void;
  deleteClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  setTrackFlag: (trackId: string, flag: "muted" | "locked" | "hidden", value: boolean) => void;

  undo: () => void;
  redo: () => void;
}

/** Aplica uma transformação imutável ao projeto e empilha no histórico. */
function withHistory(state: VideoEditorState, next: Project): Partial<VideoEditorState> {
  return {
    project: next,
    past: [...state.past.slice(-HISTORY_LIMIT + 1), state.project],
    future: [],
  };
}

/** Substitui uma trilha pelo resultado de `fn` (imutável). */
function mapTrack(project: Project, trackId: string, fn: (t: Track) => Track): Project {
  return { ...project, tracks: project.tracks.map((t) => (t.id === trackId ? fn(t) : t)) };
}

/** Encontra o clipe e sua trilha. */
function findClip(project: Project, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export const useVideoEditor = create<VideoEditorState>()((set, get) => ({
  project: makeProject(),
  past: [],
  future: [],
  sources: {},
  playheadMs: 0,
  pxPerSecond: 100,
  selectedClipId: null,

  select: (clipId) => set({ selectedClipId: clipId }),
  setPlayhead: (ms) => set({ playheadMs: Math.max(0, Math.round(ms)) }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: Math.min(400, Math.max(10, pxPerSecond)) }),

  loadProject: (project) => set({ project, past: [], future: [], selectedClipId: null, playheadMs: 0 }),
  loadFromJson: (json) => {
    const valid = validateProject(json);
    if (!valid) return false;
    set({ project: valid, past: [], future: [], selectedClipId: null, playheadMs: 0 });
    return true;
  },
  toJson: () => JSON.stringify(get().project),
  durationMs: () => projectDurationMs(get().project.tracks),

  addSource: (source) => set((s) => ({ sources: { ...s.sources, [source.id]: source } })),
  getSource: (sourceId) => get().sources[sourceId],

  addClipFromSource: (source) => {
    // trilha compatível: áudio → trilha de áudio; imagem/vídeo → trilha de vídeo
    const wantType = source.kind === "audio" ? "audio" : "video";
    const project = get().project;
    let track = project.tracks.find((t) => t.type === wantType && !t.locked);
    let trackId: string;
    if (track) {
      trackId = track.id;
    } else {
      trackId = get().addTrack(wantType);
      track = get().project.tracks.find((t) => t.id === trackId);
    }
    // adiciona o source e emenda o clipe no fim da trilha
    get().addSource(source);
    const end = (get().project.tracks.find((t) => t.id === trackId)?.clips ?? []).reduce(
      (max, c) => Math.max(max, c.startInTimeline + c.duration),
      0,
    );
    const duration = source.durationMs > 0 ? source.durationMs : IMAGE_DEFAULT_MS;
    return get().addClip({ trackId, sourceId: source.id, startInTimeline: end, duration });
  },

  addTrack: (type, name) => {
    const track = makeTrack(type, name);
    set((s) => withHistory(s, { ...s.project, tracks: [...s.project.tracks, track] }));
    return track.id;
  },

  addClip: (input) => {
    const clip = makeClip(input);
    set((s) =>
      withHistory(s, mapTrack(s.project, input.trackId, (t) => ({ ...t, clips: placeClip([...t.clips, clip], clip.id, clip.startInTimeline) }))),
    );
    return clip.id;
  },

  moveClip: (clipId, newStartMs) => {
    const found = findClip(get().project, clipId);
    if (!found || found.track.locked) return;
    set((s) => withHistory(s, mapTrack(s.project, found.track.id, (t) => ({ ...t, clips: placeClip(t.clips, clipId, newStartMs) }))));
  },

  splitAtPlayhead: () => {
    const { project, playheadMs, selectedClipId } = get();
    // divide o clipe selecionado (ou o primeiro sob o playhead)
    const target =
      (selectedClipId && findClip(project, selectedClipId)) ||
      project.tracks
        .flatMap((t) => t.clips.map((c) => ({ track: t, clip: c })))
        .find(({ clip }) => playheadMs > clip.startInTimeline && playheadMs < clip.startInTimeline + clip.duration);
    if (!target || target.track.locked) return;
    const parts = splitClipAt(target.clip, playheadMs);
    if (!parts) return;
    const [left, right] = parts;
    set((s) =>
      withHistory(
        s,
        mapTrack(s.project, target.track.id, (t) => ({
          ...t,
          clips: t.clips.flatMap((c) => (c.id === target.clip.id ? [left, right] : [c])),
        })),
      ),
    );
    set({ selectedClipId: right.id });
  },

  trimStart: (clipId, newStartMs, sourceDurationMs) => {
    const found = findClip(get().project, clipId);
    if (!found || found.track.locked) return;
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? trimClipStart(c, newStartMs, sourceDurationMs) : c)),
      }))),
    );
  },

  trimEnd: (clipId, newEndMs, sourceDurationMs) => {
    const found = findClip(get().project, clipId);
    if (!found || found.track.locked) return;
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? trimClipEnd(c, newEndMs, sourceDurationMs) : c)),
      }))),
    );
  },

  deleteClip: (clipId) => {
    const found = findClip(get().project, clipId);
    if (!found || found.track.locked) return;
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }))),
    );
    if (get().selectedClipId === clipId) set({ selectedClipId: null });
  },

  duplicateClip: (clipId) => {
    const found = findClip(get().project, clipId);
    if (!found || found.track.locked) return;
    const copy = makeClip({
      trackId: found.clip.trackId,
      sourceId: found.clip.sourceId,
      startInTimeline: found.clip.startInTimeline + found.clip.duration,
      duration: found.clip.duration,
      trimIn: found.clip.trimIn,
      trimOut: found.clip.trimOut,
      speed: found.clip.speed,
    });
    copy.transform = { ...found.clip.transform };
    copy.volume = found.clip.volume;
    copy.effects = found.clip.effects.map((e) => ({ ...e }));
    copy.blendMode = found.clip.blendMode;
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({ ...t, clips: placeClip([...t.clips, copy], copy.id, copy.startInTimeline) }))),
    );
    set({ selectedClipId: copy.id });
  },

  updateClip: (clipId, patch) => {
    const found = findClip(get().project, clipId);
    if (!found) return;
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      }))),
    );
  },

  setTrackFlag: (trackId, flag, value) => {
    set((s) => withHistory(s, mapTrack(s.project, trackId, (t) => ({ ...t, [flag]: value }))));
  },

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      const prev = s.past[s.past.length - 1];
      return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future].slice(0, HISTORY_LIMIT) };
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[0];
      return { project: next, future: s.future.slice(1), past: [...s.past, s.project].slice(-HISTORY_LIMIT) };
    }),
}));
