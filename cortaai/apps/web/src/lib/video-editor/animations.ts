// ANIMAÇÕES de entrada/saída de clipe (estilo CapCut) — funções PURAS.
// O motor pergunta "qual o envelope no instante t do clipe?" e recebe
// multiplicadores/offsets a aplicar sobre a transformação base. Tudo
// determinístico e serializável (o clipe só guarda {id, durationMs}).

import type { Clip } from "./model";

export interface AnimEnvelope {
  opacity: number; // multiplicador 0..1
  scale: number; // multiplicador
  dx: number; // offset em fração da largura do palco
  dy: number; // offset em fração da altura
  rotation: number; // graus somados
  blurPx: number; // desfoque extra (px na resolução do projeto / 100)
}

export const NEUTRAL_ENVELOPE: AnimEnvelope = { opacity: 1, scale: 1, dx: 0, dy: 0, rotation: 0, blurPx: 0 };

export interface AnimPreset {
  id: string;
  name: string;
  /** progress: 0 = totalmente "fora", 1 = totalmente "dentro" (assentado). */
  at: (progress: number) => AnimEnvelope;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export const ANIM_PRESETS: AnimPreset[] = [
  { id: "fade", name: "Fade", at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: p }) },
  {
    id: "zoom-in",
    name: "Zoom",
    at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: p, scale: 0.6 + 0.4 * easeOutCubic(p) }),
  },
  {
    id: "zoom-out",
    name: "Zoom out",
    at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: p, scale: 1.5 - 0.5 * easeOutCubic(p) }),
  },
  {
    id: "slide-left",
    name: "Deslizar ←",
    at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: Math.min(1, p * 1.4), dx: (1 - easeOutCubic(p)) * 0.6 }),
  },
  {
    id: "slide-right",
    name: "Deslizar →",
    at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: Math.min(1, p * 1.4), dx: -(1 - easeOutCubic(p)) * 0.6 }),
  },
  {
    id: "slide-up",
    name: "Subir ↑",
    at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: Math.min(1, p * 1.4), dy: (1 - easeOutCubic(p)) * 0.5 }),
  },
  {
    id: "spin",
    name: "Girar",
    at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: p, rotation: (1 - easeOutCubic(p)) * -90, scale: 0.7 + 0.3 * p }),
  },
  {
    id: "blur",
    name: "Desfocar",
    at: (p) => ({ ...NEUTRAL_ENVELOPE, opacity: Math.min(1, p * 1.2), blurPx: (1 - p) * 24 }),
  },
  {
    id: "bounce",
    name: "Pulo",
    // sobe de baixo com um leve overshoot elástico ao assentar
    at: (p) => ({
      ...NEUTRAL_ENVELOPE,
      opacity: Math.min(1, p * 1.6),
      dy: (1 - easeOutBack(p)) * 0.5,
    }),
  },
  {
    id: "flip",
    name: "Virar",
    // vira no eixo horizontal (achata e reabre), como um cartão girando
    at: (p) => ({
      ...NEUTRAL_ENVELOPE,
      opacity: Math.min(1, p * 1.5),
      scale: 0.2 + 0.8 * easeOutCubic(p),
      rotation: (1 - easeOutCubic(p)) * 20,
    }),
  },
];

const byId = new Map<string, AnimPreset>();
ANIM_PRESETS.forEach((p) => byId.set(p.id, p));

/**
 * Envelope combinado de entrada+saída do clipe no instante `clipTimeMs`
 * (relativo ao início do clipe na timeline). Fora das janelas → neutro.
 */
export function animEnvelope(clip: Clip, clipTimeMs: number): AnimEnvelope {
  let env = NEUTRAL_ENVELOPE;

  if (clip.animIn) {
    const preset = byId.get(clip.animIn.id);
    const dur = Math.max(1, Math.min(clip.animIn.durationMs, clip.duration));
    if (preset && clipTimeMs < dur) {
      env = preset.at(clamp01(clipTimeMs / dur));
    }
  }
  if (clip.animOut) {
    const preset = byId.get(clip.animOut.id);
    const dur = Math.max(1, Math.min(clip.animOut.durationMs, clip.duration));
    const fromEnd = clip.duration - clipTimeMs;
    if (preset && fromEnd < dur) {
      const out = preset.at(clamp01(fromEnd / dur));
      // combina (janelas normalmente não se sobrepõem; se sobrepuserem, multiplica)
      env = {
        opacity: env.opacity * out.opacity,
        scale: env.scale * out.scale,
        dx: env.dx + out.dx,
        dy: env.dy + out.dy,
        rotation: env.rotation + out.rotation,
        blurPx: env.blurPx + out.blurPx,
      };
    }
  }
  return env;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
