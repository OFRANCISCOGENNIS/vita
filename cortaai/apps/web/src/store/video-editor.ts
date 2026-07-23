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
  /** Deleta e puxa os clipes seguintes DA MESMA trilha para trás (ripple). */
  rippleDelete: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  /** Muda a velocidade recalculando a duração na timeline (trim preservado). */
  setClipSpeed: (clipId: string, speed: number) => void;
  /** Extrai/desvincula o áudio de um clipe de vídeo para a trilha de áudio. */
  detachAudio: (clipId: string) => void;
  /** Congela o frame no playhead: insere um segmento parado de `holdMs`. */
  freezeAtPlayhead: (holdMs?: number) => void;
  /** Troca a mídia-fonte de um clipe (mantém posição/duração na timeline). */
  replaceClipSource: (clipId: string, source: MediaSource) => void;
  /** Adiciona um clipe de texto no playhead (cria a trilha de texto se preciso). */
  addTextClip: (content: string) => string;
  /** Importa cues de legenda como clipes de texto numa trilha "Legendas" (1 ação no histórico). */
  addCaptionCues: (cues: { startMs: number; endMs: number; text: string }[]) => number;
  renameProject: (name: string) => void;
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

  rippleDelete: (clipId) => {
    const found = findClip(get().project, clipId);
    if (!found || found.track.locked) return;
    const gone = found.clip;
    const end = gone.startInTimeline + gone.duration;
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({
        ...t,
        clips: t.clips
          .filter((c) => c.id !== clipId)
          .map((c) => (c.startInTimeline >= end ? { ...c, startInTimeline: c.startInTimeline - gone.duration } : c)),
      }))),
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

  setClipSpeed: (clipId, speed) => {
    const found = findClip(get().project, clipId);
    if (!found || found.track.locked) return;
    const sp = Math.min(4, Math.max(0.25, speed));
    const srcSpan = found.clip.trimOut - found.clip.trimIn;
    const duration = Math.max(1, Math.round(srcSpan / sp));
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, speed: sp, duration } : c)),
      }))),
    );
  },

  detachAudio: (clipId) => {
    const found = findClip(get().project, clipId);
    if (!found) return;
    const src = get().sources[found.clip.sourceId];
    if (!src || src.kind !== "video") return;
    // trilha de áudio alvo (cria se preciso)
    let audioTrackId = get().project.tracks.find((t) => t.type === "audio" && !t.locked)?.id;
    if (!audioTrackId) audioTrackId = get().addTrack("audio");
    // clipe de áudio na MESMA posição/janela, apontando para a mesma mídia
    const c = found.clip;
    const audioClip = makeClip({
      trackId: audioTrackId,
      sourceId: c.sourceId,
      startInTimeline: c.startInTimeline,
      duration: c.duration,
      trimIn: c.trimIn,
      trimOut: c.trimOut,
      speed: c.speed,
    });
    audioClip.volume = c.volume;
    // muta o áudio do vídeo original e adiciona o clipe de áudio (1 ação)
    set((s) => {
      const withMuted = mapTrack(s.project, found.track.id, (t) => ({
        ...t,
        clips: t.clips.map((cc) => (cc.id === clipId ? { ...cc, volume: 0 } : cc)),
      }));
      const withAudio = mapTrack(withMuted, audioTrackId!, (t) => ({
        ...t,
        clips: placeClip([...t.clips, audioClip], audioClip.id, audioClip.startInTimeline),
      }));
      return withHistory(s, withAudio);
    });
  },

  freezeAtPlayhead: (holdMs = 2000) => {
    const { project, playheadMs, selectedClipId } = get();
    const target =
      (selectedClipId && findClip(project, selectedClipId)) ||
      project.tracks
        .flatMap((t) => t.clips.map((c) => ({ track: t, clip: c })))
        .find(({ track, clip }) => track.type === "video" && playheadMs > clip.startInTimeline && playheadMs < clip.startInTimeline + clip.duration);
    if (!target || target.track.locked) return;
    const src = get().sources[target.clip.sourceId];
    if (!src || src.kind !== "video") return;
    const parts = splitClipAt(target.clip, playheadMs);
    if (!parts) return;
    const [left, right] = parts;
    // clipe congelado que segura o frame do ponto de corte
    const frozen = makeClip({
      trackId: target.track.id,
      sourceId: target.clip.sourceId,
      startInTimeline: playheadMs,
      duration: holdMs,
      trimIn: left.trimOut, // frame exatamente no corte
      trimOut: left.trimOut + 1,
      speed: 1,
    });
    frozen.freeze = true;
    frozen.transform = { ...target.clip.transform };
    // empurra o lado direito para depois do segmento congelado
    const shiftedRight = { ...right, startInTimeline: right.startInTimeline + holdMs };
    set((s) =>
      withHistory(
        s,
        mapTrack(s.project, target.track.id, (t) => ({
          ...t,
          clips: t.clips.flatMap((c) => (c.id === target.clip.id ? [left, frozen, shiftedRight] : [c])),
        })),
      ),
    );
    set({ selectedClipId: frozen.id });
  },

  replaceClipSource: (clipId, source) => {
    const found = findClip(get().project, clipId);
    if (!found) return;
    get().addSource(source);
    const newDur = source.durationMs > 0 ? source.durationMs : found.clip.duration;
    set((s) =>
      withHistory(s, mapTrack(s.project, found.track.id, (t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, sourceId: source.id, trimIn: 0, trimOut: Math.max(1, Math.min(newDur, c.duration * c.speed)) } : c,
        ),
      }))),
    );
  },

  addTextClip: (content) => {
    const { project, playheadMs } = get();
    let track = project.tracks.find((t) => t.type === "text" && !t.locked);
    let trackId: string;
    if (track) trackId = track.id;
    else trackId = get().addTrack("text");
    const clip = makeClip({ trackId, sourceId: "", startInTimeline: playheadMs, duration: 3000 });
    clip.text = { content, fontFamily: "Inter", color: "#ffffff", fontWeight: 800, background: null };
    set((s) =>
      withHistory(s, mapTrack(s.project, trackId, (t) => ({ ...t, clips: placeClip([...t.clips, clip], clip.id, clip.startInTimeline) }))),
    );
    set({ selectedClipId: clip.id });
    return clip.id;
  },

  addCaptionCues: (cues) => {
    if (cues.length === 0) return 0;
    const s0 = get();
    let project = s0.project;
    let track = project.tracks.find((t) => t.type === "text" && t.name === "Legendas");
    if (!track) {
      track = makeTrack("text", "Legendas");
      project = { ...project, tracks: [...project.tracks, track] };
    }
    const clips = [...track.clips];
    let added = 0;
    for (const cue of cues) {
      const duration = Math.max(200, cue.endMs - cue.startMs);
      const clip = makeClip({ trackId: track.id, sourceId: "", startInTimeline: cue.startMs, duration });
      clip.text = { content: cue.text, fontFamily: "Inter", color: "#ffffff", fontWeight: 700, background: "rgba(0,0,0,0.6)" };
      clip.transform = { ...clip.transform, y: 0.36, scale: 0.75 }; // posição de legenda (embaixo)
      clips.push(clip);
      added++;
    }
    const trackId = track.id;
    const next = { ...project, tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, clips } : t)) };
    set((s) => withHistory(s, next));
    return added;
  },

  renameProject: (name) => {
    const clean = name.trim();
    if (!clean || clean === get().project.name) return;
    set((s) => withHistory(s, { ...s.project, name: clean }));
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
