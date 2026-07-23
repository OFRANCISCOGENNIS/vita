// Canvas pixel operations shared by the editor's chroma preview and the
// Estúdio de Capa (background removal + sharpen). Pure functions over
// ImageData — no DOM assumptions beyond the passed buffer.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Makes pixels close to `key` transparent. `tolerance` sets the hard cutoff and
 * `softness` widens a feathered falloff band above it (both 0..100). Mutates the
 * ImageData in place.
 */
export function keyColorFromImageData(img: ImageData, key: Rgb, tolerance: number, softness: number): void {
  const data = img.data;
  // Max RGB distance is ~441; scale the 0..100 controls into that space.
  const hard = (tolerance / 100) * 220;
  const feather = (softness / 100) * 160 + 1;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - key.r;
    const dg = data[i + 1] - key.g;
    const db = data[i + 2] - key.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= hard) {
      data[i + 3] = 0;
    } else if (dist <= hard + feather) {
      const a = (dist - hard) / feather;
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }
}

/**
 * Unsharp-mask style sharpen using a 3x3 convolution. `amount` 0..100 controls
 * strength. Returns a new ImageData (does not mutate the source).
 */
export function sharpenImageData(img: ImageData, amount: number): ImageData {
  const a = amount / 100;
  if (a <= 0) return img;
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data);
  const center = 1 + 4 * a;
  const side = -a;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const o = idx + c;
        const v =
          data[o] * center +
          data[o - 4] * side +
          data[o + 4] * side +
          data[o - w * 4] * side +
          data[o + w * 4] * side;
        out[o] = v;
      }
    }
  }
  return new ImageData(out, w, h);
}
