// Matemática PURA da timeline — sem DOM, sem estado, 100% testável.
// Tempos em milissegundos. Todas as funções são livres de efeitos colaterais e
// retornam novos objetos (imutabilidade).

import type { Clip, Track, Easing } from "./model";
import { newId } from "./model";

// ---------------------------------------------------------- tempo ↔ pixel

/** Converte um instante (ms) na posição horizontal (px) para um dado zoom. */
export function timeToPx(ms: number, pxPerSecond: number): number {
  return (ms / 1000) * pxPerSecond;
}

/** Converte uma posição horizontal (px) no instante correspondente (ms). */
export function pxToTime(px: number, pxPerSecond: number): number {
  if (pxPerSecond <= 0) return 0;
  return (px / pxPerSecond) * 1000;
}

// ---------------------------------------------------------- limites do clipe

/** Instante (ms) em que o clipe termina na timeline. */
export function clipEndMs(clip: Clip): number {
  return clip.startInTimeline + clip.duration;
}

/** Quanto da mídia-fonte (ms) o clipe consome (duração × velocidade). */
export function clipSourceSpan(clip: Clip): number {
  return clip.trimOut - clip.trimIn;
}

// ---------------------------------------------------------- snap

/**
 * "Imã": aproxima `ms` do candidato mais próximo dentro de `thresholdMs`.
 * Retorna o valor ajustado (ou o original se nada estiver perto).
 */
export function snapTime(ms: number, candidates: number[], thresholdMs: number): number {
  let best = ms;
  let bestDist = thresholdMs;
  for (const c of candidates) {
    const d = Math.abs(c - ms);
    if (d <= bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** Bordas de todos os clipes (início e fim) — candidatos de snap. */
export function boundaryCandidates(tracks: Track[], excludeClipId?: string): number[] {
  const out: number[] = [0];
  for (const t of tracks) {
    for (const c of t.clips) {
      if (c.id === excludeClipId) continue;
      out.push(c.startInTimeline, clipEndMs(c));
    }
  }
  return out;
}

// ---------------------------------------------------------- split

/**
 * Divide um clipe no instante de timeline `atMs`. Respeita a velocidade ao
 * calcular o ponto de corte na mídia-fonte. Retorna [esquerda, direita] ou
 * null quando `atMs` cai fora do interior do clipe (não há o que dividir).
 */
export function splitClipAt(clip: Clip, atMs: number): [Clip, Clip] | null {
  const start = clip.startInTimeline;
  const end = clipEndMs(clip);
  if (atMs <= start || atMs >= end) return null;

  const leftDuration = Math.round(atMs - start);
  const sourceCut = Math.round(clip.trimIn + leftDuration * clip.speed);

  const left: Clip = {
    ...clip,
    duration: leftDuration,
    trimOut: sourceCut,
    keyframes: clip.keyframes.filter((k) => k.timeMs <= leftDuration).map((k) => ({ ...k })),
  };
  const right: Clip = {
    ...clip,
    id: newId("clip"),
    startInTimeline: Math.round(atMs),
    duration: Math.round(end - atMs),
    trimIn: sourceCut,
    // keyframes da direita têm tempo re-baseado para o novo início do clipe
    keyframes: clip.keyframes
      .filter((k) => k.timeMs > leftDuration)
      .map((k) => ({ ...k, timeMs: k.timeMs - leftDuration })),
  };
  return [left, right];
}

// ---------------------------------------------------------- trim (aparar)

/**
 * Move a borda ESQUERDA do clipe para `newStartMs` na timeline, ajustando o
 * trimIn na mídia-fonte. `sourceDurationMs` limita quanto se pode revelar da
 * fonte. Nunca deixa o clipe com duração menor que `minMs`.
 */
export function trimClipStart(clip: Clip, newStartMs: number, sourceDurationMs: number, minMs = 100): Clip {
  const end = clipEndMs(clip);
  // limite: não passar do fim (menos minMs) e não revelar antes do início da fonte
  const maxStart = end - minMs;
  const minStartBySource = clip.startInTimeline - clip.trimIn / clip.speed;
  const clampedStart = Math.round(Math.min(maxStart, Math.max(minStartBySource, newStartMs)));
  const deltaTimeline = clampedStart - clip.startInTimeline;
  const trimIn = Math.round(clip.trimIn + deltaTimeline * clip.speed);
  return {
    ...clip,
    startInTimeline: Math.max(0, clampedStart),
    duration: Math.max(minMs, end - clampedStart),
    trimIn: Math.max(0, Math.min(trimIn, sourceDurationMs - 1)),
  };
}

/**
 * Move a borda DIREITA do clipe para `newEndMs`, ajustando o trimOut. Limitado
 * pelo comprimento da fonte (`sourceDurationMs`).
 */
export function trimClipEnd(clip: Clip, newEndMs: number, sourceDurationMs: number, minMs = 100): Clip {
  const start = clip.startInTimeline;
  const minEnd = start + minMs;
  // fim máximo: quanto ainda resta de fonte a partir do trimIn
  const remainingSource = sourceDurationMs - clip.trimIn;
  const maxEnd = start + Math.floor(remainingSource / clip.speed);
  const clampedEnd = Math.round(Math.min(maxEnd, Math.max(minEnd, newEndMs)));
  const duration = clampedEnd - start;
  return {
    ...clip,
    duration: Math.max(minMs, duration),
    trimOut: Math.round(clip.trimIn + duration * clip.speed),
  };
}

// ---------------------------------------------------------- mover / colisão

/** True se dois intervalos de timeline se sobrepõem. */
export function clipsOverlap(a: Clip, b: Clip): boolean {
  return a.startInTimeline < clipEndMs(b) && b.startInTimeline < clipEndMs(a);
}

/**
 * Reposiciona um clipe para `newStartMs` dentro da sua trilha, empurrando para
 * o primeiro espaço livre à direita caso colida com vizinhos (ripple simples de
 * inserção). Retorna a nova lista de clipes ordenada.
 */
export function placeClip(clips: Clip[], clipId: string, newStartMs: number): Clip[] {
  const moving = clips.find((c) => c.id === clipId);
  if (!moving) return clips;
  const others = clips.filter((c) => c.id !== clipId).sort((a, b) => a.startInTimeline - b.startInTimeline);
  let start = Math.max(0, Math.round(newStartMs));
  const candidate: Clip = { ...moving, startInTimeline: start };
  for (const o of others) {
    if (clipsOverlap({ ...candidate, startInTimeline: start }, o)) {
      start = clipEndMs(o); // encosta após o vizinho
    }
  }
  const placed = { ...moving, startInTimeline: start };
  return [...others, placed].sort((a, b) => a.startInTimeline - b.startInTimeline);
}

// ---------------------------------------------------------- z-order / render

/**
 * Ordem de composição (de baixo para cima): trilhas visuais de vídeo primeiro,
 * depois overlays/efeitos, texto e stickers por cima. Dentro do mesmo tipo,
 * mantém a ordem do array (índice maior = mais acima). Trilhas de áudio e as
 * ocultas ficam de fora do render visual.
 */
const VISUAL_ORDER: Record<Track["type"], number> = {
  video: 0,
  effect: 1,
  sticker: 2,
  text: 3,
  audio: -1, // não entra no render visual
};

export function tracksForRender(tracks: Track[]): Track[] {
  return tracks
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => !t.hidden && VISUAL_ORDER[t.type] >= 0)
    .sort((a, b) => {
      const byType = VISUAL_ORDER[a.t.type] - VISUAL_ORDER[b.t.type];
      return byType !== 0 ? byType : a.index - b.index;
    })
    .map(({ t }) => t);
}

/** Clipe ativo de uma trilha em um instante de timeline (ou null). */
export function clipAtTime(track: Track, ms: number): Clip | null {
  for (const c of track.clips) {
    if (ms >= c.startInTimeline && ms < clipEndMs(c)) return c;
  }
  return null;
}

/** Instante (ms) na mídia-fonte para um clipe em um tempo de timeline. */
export function sourceTimeForClip(clip: Clip, timelineMs: number): number {
  if (clip.freeze) return clip.trimIn; // congelado: segura sempre o mesmo frame
  const rel = timelineMs - clip.startInTimeline;
  return clip.trimIn + rel * clip.speed;
}

/** Duração total do projeto = fim do último clipe de qualquer trilha. */
export function projectDurationMs(tracks: Track[]): number {
  let max = 0;
  for (const t of tracks) {
    for (const c of t.clips) max = Math.max(max, clipEndMs(c));
  }
  return max;
}

// ---------------------------------------------------------- easing (keyframes)

export function applyEasing(easing: Easing, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (easing) {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "linear":
    default:
      return x;
  }
}

/**
 * Multiplicador de volume dos FADES de áudio do clipe no instante
 * `clipTimeMs` (relativo ao início do clipe na timeline). 1 = sem fade.
 */
export function audioGainAt(clip: Clip, clipTimeMs: number): number {
  let g = 1;
  const fadeIn = Math.min(clip.fadeInMs ?? 0, clip.duration);
  if (fadeIn > 0 && clipTimeMs < fadeIn) g *= Math.max(0, clipTimeMs / fadeIn);
  const fadeOut = Math.min(clip.fadeOutMs ?? 0, clip.duration);
  const fromEnd = clip.duration - clipTimeMs;
  if (fadeOut > 0 && fromEnd < fadeOut) g *= Math.max(0, fromEnd / fadeOut);
  return Math.min(1, Math.max(0, g));
}
