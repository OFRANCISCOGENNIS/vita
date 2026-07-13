import { describe, it, expect } from "vitest";
import { makeClip, makeTrack, validateProject, makeProject } from "./model";
import {
  timeToPx,
  pxToTime,
  snapTime,
  splitClipAt,
  trimClipStart,
  trimClipEnd,
  clipEndMs,
  placeClip,
  clipsOverlap,
  tracksForRender,
  clipAtTime,
  sourceTimeForClip,
  projectDurationMs,
  applyEasing,
  boundaryCandidates,
  audioGainAt,
} from "./timeline-math";

const clip = (over: Partial<Parameters<typeof makeClip>[0]> = {}) =>
  makeClip({ trackId: "t1", sourceId: "s1", startInTimeline: 0, duration: 4000, ...over });

describe("tempo ↔ pixel", () => {
  it("converte ida e volta sem perda em zoom padrão", () => {
    expect(timeToPx(2000, 100)).toBe(200); // 2s a 100px/s
    expect(pxToTime(200, 100)).toBe(2000);
  });
  it("pxToTime é robusto a zoom zero", () => {
    expect(pxToTime(50, 0)).toBe(0);
  });
});

describe("snap", () => {
  it("puxa para o candidato dentro do limite", () => {
    expect(snapTime(1040, [1000, 3000], 100)).toBe(1000);
  });
  it("mantém o valor quando nada está perto", () => {
    expect(snapTime(1400, [1000, 3000], 100)).toBe(1400);
  });
  it("candidatos incluem bordas de todos os clipes menos o excluído", () => {
    const t = { ...makeTrack("video"), clips: [clip({ id: "a", startInTimeline: 1000, duration: 2000 })] };
    expect(boundaryCandidates([t])).toEqual(expect.arrayContaining([0, 1000, 3000]));
    expect(boundaryCandidates([t], "a")).toEqual([0]);
  });
});

describe("split", () => {
  it("divide na timeline e reparte a mídia-fonte (velocidade 1)", () => {
    const [l, r] = splitClipAt(clip({ duration: 4000, trimIn: 0, trimOut: 4000 }), 1500)!;
    expect(l.duration).toBe(1500);
    expect(l.trimOut).toBe(1500);
    expect(r.startInTimeline).toBe(1500);
    expect(r.duration).toBe(2500);
    expect(r.trimIn).toBe(1500);
    expect(clipEndMs(l)).toBe(r.startInTimeline); // sem buraco nem sobreposição
  });
  it("respeita a velocidade ao repartir a fonte (2x)", () => {
    // 2s de timeline a 2x consomem 4s de fonte
    const c = clip({ duration: 2000, speed: 2, trimIn: 0, trimOut: 4000 });
    const [l, r] = splitClipAt(c, 1000)!;
    expect(l.trimOut).toBe(2000); // 1000ms * 2x
    expect(r.trimIn).toBe(2000);
  });
  it("retorna null fora do interior", () => {
    expect(splitClipAt(clip({ startInTimeline: 0, duration: 2000 }), 0)).toBeNull();
    expect(splitClipAt(clip({ startInTimeline: 0, duration: 2000 }), 2000)).toBeNull();
  });
  it("distribui keyframes entre os lados e re-baseia o da direita", () => {
    const c = { ...clip({ duration: 4000 }), keyframes: [
      { property: "opacity" as const, timeMs: 500, value: 0, easing: "linear" as const },
      { property: "opacity" as const, timeMs: 3000, value: 1, easing: "linear" as const },
    ] };
    const [l, r] = splitClipAt(c, 2000)!;
    expect(l.keyframes).toHaveLength(1);
    expect(l.keyframes[0].timeMs).toBe(500);
    expect(r.keyframes).toHaveLength(1);
    expect(r.keyframes[0].timeMs).toBe(1000); // 3000 - 2000
  });
});

describe("trim", () => {
  it("apara a esquerda ajustando trimIn e mantém o fim", () => {
    const c = clip({ startInTimeline: 0, duration: 4000, trimIn: 0, trimOut: 4000 });
    const t = trimClipStart(c, 1000, 4000);
    expect(t.startInTimeline).toBe(1000);
    expect(t.trimIn).toBe(1000);
    expect(clipEndMs(t)).toBe(4000); // fim inalterado
  });
  it("apara a direita limitado pela fonte", () => {
    const c = clip({ startInTimeline: 0, duration: 2000, trimIn: 0, trimOut: 2000 });
    const t = trimClipEnd(c, 9999, 3000); // fonte só tem 3s
    expect(clipEndMs(t)).toBe(3000);
    expect(t.trimOut).toBe(3000);
  });
  it("nunca fica abaixo da duração mínima", () => {
    const c = clip({ startInTimeline: 0, duration: 4000 });
    const t = trimClipStart(c, 3999, 8000, 200);
    expect(t.duration).toBeGreaterThanOrEqual(200);
  });
});

describe("posicionamento e colisão", () => {
  it("detecta sobreposição", () => {
    const a = clip({ id: "a", startInTimeline: 0, duration: 2000 });
    const b = clip({ id: "b", startInTimeline: 1000, duration: 2000 });
    const c = clip({ id: "c", startInTimeline: 5000, duration: 1000 });
    expect(clipsOverlap(a, b)).toBe(true);
    expect(clipsOverlap(a, c)).toBe(false);
  });
  it("encosta após o vizinho ao colidir (ripple de inserção)", () => {
    const a = clip({ id: "a", startInTimeline: 0, duration: 2000 });
    const b = clip({ id: "b", startInTimeline: 5000, duration: 2000 });
    const placed = placeClip([a, b], "b", 1000); // b tenta cair sobre a
    const nb = placed.find((c) => c.id === "b")!;
    expect(nb.startInTimeline).toBe(2000); // encostou no fim de a
  });
});

describe("z-order / render", () => {
  it("ordena vídeo→efeito→sticker→texto e exclui áudio/oculto", () => {
    const v = makeTrack("video", "V");
    const txt = makeTrack("text", "T");
    const aud = makeTrack("audio", "A");
    const hidden = { ...makeTrack("sticker", "H"), hidden: true };
    const order = tracksForRender([txt, aud, v, hidden]).map((t) => t.type);
    expect(order).toEqual(["video", "text"]);
  });
  it("clipAtTime e sourceTimeForClip", () => {
    const c = clip({ startInTimeline: 1000, duration: 2000, trimIn: 500, trimOut: 2500 });
    const track = { ...makeTrack("video"), clips: [c] };
    expect(clipAtTime(track, 1500)?.id).toBe(c.id);
    expect(clipAtTime(track, 500)).toBeNull();
    expect(sourceTimeForClip(c, 1500)).toBe(1000); // 500 + (1500-1000)*1
  });
  it("projectDurationMs pega o fim mais tardio", () => {
    const v = { ...makeTrack("video"), clips: [clip({ startInTimeline: 0, duration: 3000 })] };
    const a = { ...makeTrack("audio"), clips: [clip({ startInTimeline: 4000, duration: 2000 })] };
    expect(projectDurationMs([v, a])).toBe(6000);
  });
});

describe("easing", () => {
  it("linear é identidade e clampa", () => {
    expect(applyEasing("linear", 0.5)).toBe(0.5);
    expect(applyEasing("linear", -1)).toBe(0);
    expect(applyEasing("linear", 2)).toBe(1);
  });
  it("easeInOut é simétrico nos extremos", () => {
    expect(applyEasing("easeInOut", 0)).toBe(0);
    expect(applyEasing("easeInOut", 1)).toBe(1);
    expect(applyEasing("easeInOut", 0.5)).toBeCloseTo(0.5, 5);
  });
});

describe("validação de projeto", () => {
  it("sanea um projeto válido", () => {
    const p = makeProject();
    const round = validateProject(JSON.parse(JSON.stringify(p)));
    expect(round?.tracks.length).toBe(2);
  });
  it("rejeita lixo e conserta campos ausentes", () => {
    expect(validateProject(null)).toBeNull();
    expect(validateProject({ tracks: "x" })).toBeNull();
    const fixed = validateProject({ resolution: { w: 1080, h: 1920 }, fps: 30, tracks: [] });
    expect(fixed?.tracks.length).toBe(2); // repõe trilhas padrão
  });
});

describe("audioGainAt", () => {
  it("sem fades é sempre 1", () => {
    const clip = makeClip({ trackId: "t", sourceId: "s", startInTimeline: 0, duration: 2000 });
    expect(audioGainAt(clip, 0)).toBe(1);
    expect(audioGainAt(clip, 1999)).toBe(1);
  });

  it("fade de entrada sobe 0→1 e fade de saída desce 1→0", () => {
    const clip = makeClip({ trackId: "t", sourceId: "s", startInTimeline: 0, duration: 4000 });
    clip.fadeInMs = 1000;
    clip.fadeOutMs = 1000;
    expect(audioGainAt(clip, 0)).toBe(0);
    expect(audioGainAt(clip, 500)).toBeCloseTo(0.5, 5);
    expect(audioGainAt(clip, 2000)).toBe(1);
    expect(audioGainAt(clip, 3500)).toBeCloseTo(0.5, 5);
    expect(audioGainAt(clip, 4000)).toBe(0);
  });

  it("fades maiores que o clipe são limitados", () => {
    const clip = makeClip({ trackId: "t", sourceId: "s", startInTimeline: 0, duration: 1000 });
    clip.fadeInMs = 99_000;
    expect(audioGainAt(clip, 500)).toBeCloseTo(0.5, 5);
  });
});

describe("sourceTimeForClip com freeze", () => {
  it("clipe normal mapeia linearmente com a velocidade", () => {
    const clip = makeClip({ trackId: "t", sourceId: "s", startInTimeline: 1000, duration: 2000 });
    expect(sourceTimeForClip(clip, 1000)).toBe(0);
    expect(sourceTimeForClip(clip, 2000)).toBe(1000);
  });

  it("clipe congelado segura sempre trimIn", () => {
    const clip = makeClip({ trackId: "t", sourceId: "s", startInTimeline: 1000, duration: 2000, trimIn: 500 });
    clip.freeze = true;
    expect(sourceTimeForClip(clip, 1000)).toBe(500);
    expect(sourceTimeForClip(clip, 2500)).toBe(500);
    expect(sourceTimeForClip(clip, 2999)).toBe(500);
  });
});
