import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "./model";
import { previousAdjacentClip, transitionAt, TRANSITIONS } from "./transitions";

function trackWithTwo(gapMs: number) {
  const track = makeTrack("video");
  const a = makeClip({ trackId: track.id, sourceId: "s1", startInTimeline: 0, duration: 2000 });
  const b = makeClip({ trackId: track.id, sourceId: "s2", startInTimeline: 2000 + gapMs, duration: 2000 });
  track.clips = [a, b];
  return { track, a, b };
}

describe("catálogo TRANSITIONS", () => {
  it("tem ids únicos e nomes preenchidos", () => {
    const ids = TRANSITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TRANSITIONS) expect(t.name.length).toBeGreaterThan(0);
  });

  it("inclui as transições novas desenhadas no engine", () => {
    const ids = new Set(TRANSITIONS.map((t) => t.id));
    for (const id of ["empurrar", "deslizar-cima", "giro", "relogio", "xadrez", "diagonal", "flash"]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe("previousAdjacentClip", () => {
  it("acha o clipe imediatamente anterior colado", () => {
    const { track, a, b } = trackWithTwo(0);
    expect(previousAdjacentClip(track, b)?.id).toBe(a.id);
  });

  it("tolera pequenas folgas (até 80ms)", () => {
    const { track, a, b } = trackWithTwo(60);
    expect(previousAdjacentClip(track, b)?.id).toBe(a.id);
  });

  it("não considera clipes distantes", () => {
    const { track, b } = trackWithTwo(500);
    expect(previousAdjacentClip(track, b)).toBeNull();
  });
});

describe("transitionAt", () => {
  it("null sem transitionIn", () => {
    const { track, b } = trackWithTwo(0);
    expect(transitionAt(track, b, 100)).toBeNull();
  });

  it("progresso 0→1 dentro da janela e null depois", () => {
    const { track, a, b } = trackWithTwo(0);
    b.transitionIn = { id: "fundido", durationMs: 1000 };
    expect(transitionAt(track, b, 0)?.progress).toBe(0);
    expect(transitionAt(track, b, 500)?.progress).toBeCloseTo(0.5, 5);
    expect(transitionAt(track, b, 500)?.prev.id).toBe(a.id);
    expect(transitionAt(track, b, 1000)).toBeNull();
  });

  it("duração da transição limitada à duração do clipe", () => {
    const { track, b } = trackWithTwo(0);
    b.transitionIn = { id: "zoom", durationMs: 99_000 };
    expect(transitionAt(track, b, 1000)?.progress).toBeCloseTo(0.5, 5);
  });

  it("null sem clipe anterior adjacente", () => {
    const { track, b } = trackWithTwo(500);
    b.transitionIn = { id: "fundido", durationMs: 800 };
    expect(transitionAt(track, b, 100)).toBeNull();
  });
});
