import { describe, expect, it } from "vitest";
import { autoEnhanceAdjustments } from "./photo-engine";

/** Cria um "ImageData-like" preenchido com uma cor RGB constante. */
function solid(r: number, g: number, b: number, w = 16, h = 16) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

/** Gradiente de luma limitado à faixa [lo, hi] (baixo contraste). */
function lowContrast(lo: number, hi: number, w = 32, h = 32) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      const v = Math.round(lo + t * (hi - lo));
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

describe("autoEnhanceAdjustments", () => {
  it("imagem de baixo contraste ganha contraste positivo", () => {
    const patch = autoEnhanceAdjustments(lowContrast(90, 150));
    expect(patch.contrast).toBeGreaterThan(0);
  });

  it("imagem escura fica mais clara (brightness positivo)", () => {
    const patch = autoEnhanceAdjustments(lowContrast(10, 60));
    expect(patch.brightness).toBeGreaterThan(0);
  });

  it("imagem clara demais fica mais escura (brightness negativo)", () => {
    const patch = autoEnhanceAdjustments(lowContrast(190, 240));
    expect(patch.brightness).toBeLessThan(0);
  });

  it("dominante azul é aquecida (temperature positiva)", () => {
    const patch = autoEnhanceAdjustments(solid(90, 110, 200));
    expect(patch.temperature).toBeGreaterThan(0);
  });

  it("dominante vermelha é esfriada (temperature negativa)", () => {
    const patch = autoEnhanceAdjustments(solid(200, 110, 90));
    expect(patch.temperature).toBeLessThan(0);
  });

  it("cinza neutro não desvia o balanço de branco", () => {
    const patch = autoEnhanceAdjustments(solid(128, 128, 128));
    expect(Math.abs(patch.temperature ?? 0)).toBeLessThanOrEqual(1);
    expect(Math.abs(patch.tint ?? 0)).toBeLessThanOrEqual(1);
  });

  it("todos os valores respeitam o intervalo -100..100", () => {
    const patch = autoEnhanceAdjustments(solid(0, 0, 255));
    for (const v of Object.values(patch)) {
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
