import { describe, expect, it } from "vitest";
import { animEnvelope, ANIM_PRESETS, NEUTRAL_ENVELOPE } from "./animations";
import { makeClip } from "./model";

function clipWith(anim: { in?: { id: string; durationMs: number }; out?: { id: string; durationMs: number } }) {
  const clip = makeClip({ trackId: "t", sourceId: "s", startInTimeline: 0, duration: 4000 });
  if (anim.in) clip.animIn = anim.in;
  if (anim.out) clip.animOut = anim.out;
  return clip;
}

describe("animEnvelope", () => {
  it("é neutro sem animações", () => {
    const clip = clipWith({});
    expect(animEnvelope(clip, 0)).toEqual(NEUTRAL_ENVELOPE);
    expect(animEnvelope(clip, 2000)).toEqual(NEUTRAL_ENVELOPE);
  });

  it("fade de entrada: opacidade 0→1 na janela e neutro depois", () => {
    const clip = clipWith({ in: { id: "fade", durationMs: 1000 } });
    expect(animEnvelope(clip, 0).opacity).toBe(0);
    expect(animEnvelope(clip, 500).opacity).toBeCloseTo(0.5, 5);
    expect(animEnvelope(clip, 1000).opacity).toBe(1);
    expect(animEnvelope(clip, 3000)).toEqual(NEUTRAL_ENVELOPE);
  });

  it("fade de saída: opacidade 1→0 no fim do clipe", () => {
    const clip = clipWith({ out: { id: "fade", durationMs: 1000 } });
    expect(animEnvelope(clip, 2999).opacity).toBe(1);
    expect(animEnvelope(clip, 3500).opacity).toBeCloseTo(0.5, 5);
    expect(animEnvelope(clip, 4000).opacity).toBeCloseTo(0, 5);
  });

  it("zoom-in começa menor e assenta em 1", () => {
    const clip = clipWith({ in: { id: "zoom-in", durationMs: 800 } });
    expect(animEnvelope(clip, 0).scale).toBeCloseTo(0.6, 5);
    expect(animEnvelope(clip, 800).scale).toBeCloseTo(1, 5);
  });

  it("slide-left desloca no eixo x e zera ao assentar", () => {
    const clip = clipWith({ in: { id: "slide-left", durationMs: 500 } });
    expect(animEnvelope(clip, 0).dx).toBeCloseTo(0.6, 5);
    expect(animEnvelope(clip, 500).dx).toBeCloseTo(0, 5);
  });

  it("duração da animação é limitada à duração do clipe", () => {
    const clip = clipWith({ in: { id: "fade", durationMs: 99_000 } });
    // janela vira 4000ms → no meio do clipe a opacidade é 0.5
    expect(animEnvelope(clip, 2000).opacity).toBeCloseTo(0.5, 5);
  });

  it("id desconhecido é ignorado (neutro)", () => {
    const clip = clipWith({ in: { id: "nao-existe", durationMs: 1000 } });
    expect(animEnvelope(clip, 100)).toEqual(NEUTRAL_ENVELOPE);
  });

  it("bounce entra deslocado no eixo y e assenta em 0", () => {
    const clip = clipWith({ in: { id: "bounce", durationMs: 500 } });
    expect(animEnvelope(clip, 0).dy).toBeCloseTo(0.5, 5);
    expect(animEnvelope(clip, 500).dy).toBeCloseTo(0, 5);
  });

  it("flip começa achatado (escala pequena) e assenta em 1", () => {
    const clip = clipWith({ in: { id: "flip", durationMs: 500 } });
    expect(animEnvelope(clip, 0).scale).toBeCloseTo(0.2, 5);
    expect(animEnvelope(clip, 500).scale).toBeCloseTo(1, 5);
  });

  it("todos os presets assentam no envelope neutro em progress=1", () => {
    for (const p of ANIM_PRESETS) {
      const env = p.at(1);
      expect(env.opacity).toBeCloseTo(1, 4);
      expect(env.scale).toBeCloseTo(1, 4);
      expect(env.dx).toBeCloseTo(0, 4);
      expect(env.dy).toBeCloseTo(0, 4);
      expect(env.rotation).toBeCloseTo(0, 4);
      expect(env.blurPx).toBeCloseTo(0, 4);
    }
  });
});
