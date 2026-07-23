// TRANSIÇÕES entre clipes adjacentes da MESMA trilha — o clipe guarda
// `transitionIn` (transição com o clipe anterior). O motor desenha o clipe
// anterior congelado no último frame + o clipe atual entrando, conforme o
// preset. Helpers puros e testáveis; o desenho fica no engine.

import type { Clip, Track } from "./model";
import { clipEndMs } from "./timeline-math";

export const TRANSITIONS: { id: string; name: string }[] = [
  { id: "fundido", name: "Fundido" },
  { id: "escurecer", name: "Escurecer" },
  { id: "deslizar", name: "Deslizar ←" },
  { id: "deslizar-cima", name: "Subir ↑" },
  { id: "empurrar", name: "Empurrar" },
  { id: "circulo", name: "Círculo" },
  { id: "relogio", name: "Relógio" },
  { id: "zoom", name: "Zoom" },
  { id: "giro", name: "Giro" },
  { id: "cortina", name: "Cortina" },
  { id: "persiana", name: "Persiana" },
  { id: "xadrez", name: "Xadrez" },
  { id: "diagonal", name: "Diagonal" },
  { id: "flash", name: "Flash" },
];

/** Tolerância para considerar dois clipes adjacentes (ms). */
export const ADJACENT_TOLERANCE_MS = 80;

/** Clipe imediatamente anterior e adjacente na mesma trilha (ou null). */
export function previousAdjacentClip(track: Track, clip: Clip): Clip | null {
  let best: Clip | null = null;
  for (const c of track.clips) {
    if (c.id === clip.id) continue;
    const gap = clip.startInTimeline - clipEndMs(c);
    if (Math.abs(gap) <= ADJACENT_TOLERANCE_MS) {
      if (!best || clipEndMs(c) > clipEndMs(best)) best = c;
    }
  }
  return best;
}

export interface ActiveTransition {
  id: string;
  prev: Clip;
  progress: number; // 0 = início da transição, 1 = terminou
}

/**
 * Transição ativa do clipe no instante `clipTimeMs` (relativo ao início do
 * clipe). Null quando não há transição, não há clipe anterior adjacente ou a
 * janela já passou.
 */
export function transitionAt(track: Track, clip: Clip, clipTimeMs: number): ActiveTransition | null {
  if (!clip.transitionIn) return null;
  const dur = Math.max(1, Math.min(clip.transitionIn.durationMs, clip.duration));
  if (clipTimeMs < 0 || clipTimeMs >= dur) return null;
  const prev = previousAdjacentClip(track, clip);
  if (!prev) return null;
  return { id: clip.transitionIn.id, prev, progress: Math.min(1, Math.max(0, clipTimeMs / dur)) };
}
