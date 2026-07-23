// MODELO DE DADOS do editor de vídeo multitrilha (fonte da verdade).
//
// Tudo aqui é 100% serializável (JSON) para permitir salvar/carregar projeto,
// undo/redo e sync futuro. Tempos em MILISSEGUNDOS (inteiros seguros). A UI
// nunca muta estes objetos diretamente — despacha ações no store, que produz
// um novo estado imutável.

export type TrackType = "video" | "audio" | "text" | "sticker" | "effect";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "lighten"
  | "darken"
  | "difference";

export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut";

/** Propriedades animáveis por keyframe. */
export type AnimatableProperty = "x" | "y" | "scale" | "rotation" | "opacity" | "volume";

export interface Keyframe {
  property: AnimatableProperty;
  timeMs: number; // relativo ao início do clipe na timeline
  value: number;
  easing: Easing;
}

export interface ClipTransform {
  x: number; // deslocamento em fração da largura do palco (-1..1), 0 = centro
  y: number; // deslocamento em fração da altura do palco (-1..1)
  scale: number; // 1 = tamanho natural (cover)
  rotation: number; // graus
  opacity: number; // 0..1
}

export interface EffectRef {
  id: string; // id do efeito (catálogo em edit-visuals)
  intensity: number; // 0..1
}

export interface ClipMask {
  kind: "rect" | "ellipse";
  x: number; // 0..1 (centro)
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
  feather: number; // 0..1
  inverted: boolean;
}

/** Animação de entrada/saída do clipe (catálogo em animations.ts). */
export interface ClipAnim {
  id: string;
  durationMs: number;
}

export interface Clip {
  id: string;
  trackId: string;
  sourceId: string; // referência a uma MediaSource no media-registry
  startInTimeline: number; // ms — onde o clipe começa na timeline
  duration: number; // ms — duração NA TIMELINE (já considerando a velocidade)
  trimIn: number; // ms — ponto inicial dentro da mídia-fonte
  trimOut: number; // ms — ponto final dentro da mídia-fonte (trimOut-trimIn = duration*speed)
  transform: ClipTransform;
  volume: number; // 0..1 (linear)
  speed: number; // 1 = normal; >1 acelera. Curvas vêm por keyframes 'speed' (futuro).
  keyframes: Keyframe[];
  effects: EffectRef[];
  filterId?: string; // filtro estilizado (fade/retrô/…)
  blendMode: BlendMode;
  mask?: ClipMask;
  animIn?: ClipAnim; // animação de entrada (fade/zoom/slide/…)
  animOut?: ClipAnim; // animação de saída
  fadeInMs?: number; // fade de ÁUDIO na entrada
  fadeOutMs?: number; // fade de ÁUDIO na saída
  transitionIn?: ClipAnim; // transição COM O CLIPE ANTERIOR adjacente (catálogo em transitions.ts)
  eq?: { low: number; mid: number; high: number }; // equalizador em dB (-12..+12)
  freeze?: boolean; // congela o frame em `trimIn` por toda a duração do clipe
  /** Tratamentos de áudio (DSP real, aplicado na exportação). */
  audioFx?: { denoise?: boolean; voice?: boolean };
  /** Chroma key: remove a cor (fundo verde/azul) do clipe de vídeo. */
  chroma?: { color: string; tolerance: number; softness: number };
  /** Remoção de fundo por IA (segmentação de pessoa, sem tela verde). */
  bgRemove?: boolean;
  /** Color grading por clipe (estilo Lumetri): valores -100..100 / hue -180..180. */
  colorAdjust?: { brightness: number; contrast: number; saturation: number; hue: number };
  // Texto (só para clips em trilha 'text'): conteúdo e estilo básico.
  text?: {
    content: string;
    fontFamily: string;
    color: string;
    fontWeight: number;
    background: string | null;
  };
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface Project {
  id: string;
  name: string;
  resolution: { w: number; h: number };
  fps: number;
  tracks: Track[];
  version: 1;
}

// ------------------------------------------------------------------ defaults

export const DEFAULT_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
};

let counter = 0;
/** Id estável e serializável (não usa Date.now/Math.random no caminho puro). */
export function newId(prefix: string, seed?: number): string {
  counter += 1;
  const base = seed != null ? seed : counter;
  return `${prefix}_${base.toString(36)}${counter.toString(36)}`;
}

export function makeTrack(type: TrackType, name?: string, id?: string): Track {
  return {
    id: id ?? newId("trk"),
    type,
    name: name ?? defaultTrackName(type),
    clips: [],
    muted: false,
    locked: false,
    hidden: false,
  };
}

function defaultTrackName(type: TrackType): string {
  switch (type) {
    case "video":
      return "Vídeo";
    case "audio":
      return "Áudio";
    case "text":
      return "Texto";
    case "sticker":
      return "Elementos";
    case "effect":
      return "Efeitos";
  }
}

export interface MakeClipInput {
  trackId: string;
  sourceId: string;
  startInTimeline: number;
  duration: number;
  trimIn?: number;
  trimOut?: number;
  speed?: number;
  id?: string;
}

export function makeClip(input: MakeClipInput): Clip {
  const speed = input.speed ?? 1;
  const trimIn = input.trimIn ?? 0;
  const trimOut = input.trimOut ?? trimIn + input.duration * speed;
  return {
    id: input.id ?? newId("clip"),
    trackId: input.trackId,
    sourceId: input.sourceId,
    startInTimeline: Math.max(0, Math.round(input.startInTimeline)),
    duration: Math.max(1, Math.round(input.duration)),
    trimIn: Math.max(0, Math.round(trimIn)),
    trimOut: Math.max(1, Math.round(trimOut)),
    transform: { ...DEFAULT_TRANSFORM },
    volume: 1,
    speed,
    keyframes: [],
    effects: [],
    blendMode: "normal",
  };
}

export function makeProject(name = "Novo projeto", resolution = { w: 1080, h: 1920 }, fps = 30): Project {
  return {
    id: newId("proj"),
    name,
    resolution,
    fps,
    tracks: [makeTrack("video"), makeTrack("audio")],
    version: 1,
  };
}

// ---------------------------------------------------------------- validation

/**
 * Valida/normaliza um projeto carregado de JSON (defensivo contra dados
 * corrompidos). Retorna o projeto saneado ou null quando irrecuperável.
 */
export function validateProject(input: unknown): Project | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Partial<Project>;
  if (!Array.isArray(p.tracks) || !p.resolution || typeof p.fps !== "number") return null;
  const resolution = {
    w: clampInt(p.resolution.w, 16, 7680, 1080),
    h: clampInt(p.resolution.h, 16, 7680, 1920),
  };
  const tracks: Track[] = p.tracks
    .filter((t): t is Track => !!t && typeof t === "object" && Array.isArray((t as Track).clips))
    .map((t) => ({
      id: String(t.id ?? newId("trk")),
      type: (["video", "audio", "text", "sticker", "effect"] as TrackType[]).includes(t.type) ? t.type : "video",
      name: String(t.name ?? "Trilha"),
      muted: !!t.muted,
      locked: !!t.locked,
      hidden: !!t.hidden,
      clips: t.clips
        .filter((c): c is Clip => !!c && typeof c === "object")
        .map((c) => sanitizeClip(c, t.id)),
    }));
  return {
    id: String(p.id ?? newId("proj")),
    name: String(p.name ?? "Projeto"),
    resolution,
    fps: clampInt(p.fps, 1, 120, 30),
    tracks: tracks.length ? tracks : [makeTrack("video"), makeTrack("audio")],
    version: 1,
  };
}

function sanitizeClip(c: Clip, trackId: string): Clip {
  const speed = Number.isFinite(c.speed) && c.speed > 0 ? c.speed : 1;
  const duration = clampInt(c.duration, 1, Number.MAX_SAFE_INTEGER, 1000);
  const trimIn = clampInt(c.trimIn, 0, Number.MAX_SAFE_INTEGER, 0);
  return {
    id: String(c.id ?? newId("clip")),
    trackId: String(c.trackId ?? trackId),
    sourceId: String(c.sourceId ?? ""),
    startInTimeline: clampInt(c.startInTimeline, 0, Number.MAX_SAFE_INTEGER, 0),
    duration,
    trimIn,
    trimOut: clampInt(c.trimOut, trimIn + 1, Number.MAX_SAFE_INTEGER, trimIn + duration * speed),
    transform: {
      x: numOr(c.transform?.x, 0),
      y: numOr(c.transform?.y, 0),
      scale: numOr(c.transform?.scale, 1),
      rotation: numOr(c.transform?.rotation, 0),
      opacity: clamp01(numOr(c.transform?.opacity, 1)),
    },
    volume: clamp01(numOr(c.volume, 1)),
    speed,
    keyframes: Array.isArray(c.keyframes) ? c.keyframes.filter(isKeyframe) : [],
    effects: Array.isArray(c.effects) ? c.effects.filter((e) => !!e && typeof e.id === "string") : [],
    filterId: typeof c.filterId === "string" ? c.filterId : undefined,
    blendMode: c.blendMode ?? "normal",
    mask: sanitizeMask(c.mask),
    freeze: c.freeze === true ? true : undefined,
    audioFx:
      c.audioFx && (c.audioFx.denoise === true || c.audioFx.voice === true)
        ? { denoise: c.audioFx.denoise === true || undefined, voice: c.audioFx.voice === true || undefined }
        : undefined,
    chroma: sanitizeChroma(c.chroma),
    bgRemove: c.bgRemove === true ? true : undefined,
    colorAdjust: sanitizeColorAdjust(c.colorAdjust),
    animIn: sanitizeAnim(c.animIn),
    animOut: sanitizeAnim(c.animOut),
    fadeInMs: typeof c.fadeInMs === "number" && c.fadeInMs > 0 ? Math.min(10_000, Math.round(c.fadeInMs)) : undefined,
    fadeOutMs: typeof c.fadeOutMs === "number" && c.fadeOutMs > 0 ? Math.min(10_000, Math.round(c.fadeOutMs)) : undefined,
    transitionIn: sanitizeAnim(c.transitionIn),
    eq: sanitizeEq(c.eq),
    text: c.text,
  };
}

function sanitizeColorAdjust(
  ca: unknown,
): { brightness: number; contrast: number; saturation: number; hue: number } | undefined {
  if (!ca || typeof ca !== "object") return undefined;
  const c = ca as { brightness?: unknown; contrast?: unknown; saturation?: unknown; hue?: unknown };
  const band = (v: unknown, lim: number) => Math.min(lim, Math.max(-lim, typeof v === "number" && Number.isFinite(v) ? v : 0));
  const out = {
    brightness: band(c.brightness, 100),
    contrast: band(c.contrast, 100),
    saturation: band(c.saturation, 100),
    hue: band(c.hue, 180),
  };
  if (out.brightness === 0 && out.contrast === 0 && out.saturation === 0 && out.hue === 0) return undefined;
  return out;
}

function sanitizeChroma(ch: unknown): { color: string; tolerance: number; softness: number } | undefined {
  if (!ch || typeof ch !== "object") return undefined;
  const c = ch as { color?: unknown; tolerance?: unknown; softness?: unknown };
  if (typeof c.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c.color)) return undefined;
  return {
    color: c.color,
    tolerance: clamp01(numOr(c.tolerance, 0.3)),
    softness: clamp01(numOr(c.softness, 0.1)),
  };
}

function sanitizeMask(m: unknown): ClipMask | undefined {
  if (!m || typeof m !== "object") return undefined;
  const mask = m as Partial<ClipMask>;
  if (mask.kind !== "rect" && mask.kind !== "ellipse") return undefined;
  const f01 = (v: unknown, d: number) => clamp01(numOr(v, d));
  return {
    kind: mask.kind,
    x: f01(mask.x, 0.5),
    y: f01(mask.y, 0.5),
    w: f01(mask.w, 0.6),
    h: f01(mask.h, 0.6),
    feather: f01(mask.feather, 0.1),
    inverted: mask.inverted === true,
  };
}

function sanitizeEq(e: unknown): { low: number; mid: number; high: number } | undefined {
  if (!e || typeof e !== "object") return undefined;
  const eq = e as { low?: unknown; mid?: unknown; high?: unknown };
  const band = (v: unknown) => Math.min(12, Math.max(-12, typeof v === "number" && Number.isFinite(v) ? v : 0));
  const low = band(eq.low);
  const mid = band(eq.mid);
  const high = band(eq.high);
  if (low === 0 && mid === 0 && high === 0) return undefined;
  return { low, mid, high };
}

function sanitizeAnim(a: unknown): ClipAnim | undefined {
  if (!a || typeof a !== "object") return undefined;
  const anim = a as Partial<ClipAnim>;
  if (typeof anim.id !== "string" || !anim.id) return undefined;
  return { id: anim.id, durationMs: clampInt(anim.durationMs, 50, 10_000, 500) };
}

function isKeyframe(k: unknown): k is Keyframe {
  return (
    !!k &&
    typeof k === "object" &&
    typeof (k as Keyframe).timeMs === "number" &&
    typeof (k as Keyframe).value === "number"
  );
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
}
function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
