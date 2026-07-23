// ENCODER GIF89a próprio (LZW) — sem dependência. Quantiza cada frame para uma
// paleta fixa 6×6×6 (216 cores) + rampa de cinzas, com dithering Floyd–Steinberg
// e comprime os índices com LZW. Usado para exportar a timeline como GIF animado.

export interface GifFrameInput {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
}

// paleta 6×6×6 (216) + 40 tons de cinza = 256
const PALETTE: [number, number, number][] = buildPalette();

function buildPalette(): [number, number, number][] {
  const levels = [0, 51, 102, 153, 204, 255];
  const pal: [number, number, number][] = [];
  for (const r of levels) for (const g of levels) for (const b of levels) pal.push([r, g, b]);
  for (let i = 0; i < 40; i++) {
    const v = Math.round((i / 39) * 255);
    pal.push([v, v, v]);
  }
  return pal;
}

function nearestIndex(r: number, g: number, b: number): number {
  // cubo 6×6×6 direto para as 216 primeiras (rápido); cinzas raramente vencem
  const rl = quantLevel(r);
  const gl = quantLevel(g);
  const bl = quantLevel(b);
  return rl * 36 + gl * 6 + bl;
}

function quantLevel(v: number): number {
  return Math.min(5, Math.round(v / 51));
}

/** Quantiza um frame RGBA para índices da paleta com dithering Floyd–Steinberg. */
function quantizeFrame(frame: GifFrameInput): Uint8Array {
  const { data, width, height } = frame;
  const indices = new Uint8Array(width * height);
  // buffer de erro em float para dithering
  const buf = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) buf[i] = data[i];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const r = clamp255(buf[p]);
      const g = clamp255(buf[p + 1]);
      const b = clamp255(buf[p + 2]);
      const idx = nearestIndex(r, g, b);
      indices[y * width + x] = idx;
      const [pr, pg, pb] = PALETTE[idx];
      const er = r - pr;
      const eg = g - pg;
      const eb = b - pb;
      spread(buf, x + 1, y, width, height, er, eg, eb, 7 / 16);
      spread(buf, x - 1, y + 1, width, height, er, eg, eb, 3 / 16);
      spread(buf, x, y + 1, width, height, er, eg, eb, 5 / 16);
      spread(buf, x + 1, y + 1, width, height, er, eg, eb, 1 / 16);
    }
  }
  return indices;
}

function spread(buf: Float32Array, x: number, y: number, w: number, h: number, er: number, eg: number, eb: number, f: number): void {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const p = (y * w + x) * 4;
  buf[p] += er * f;
  buf[p + 1] += eg * f;
  buf[p + 2] += eb * f;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ---------------------------------------------------------------- LZW (GIF)

function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out: number[] = [];
  let cur = 0;
  let curBits = 0;
  const emit = (code: number, size: number) => {
    cur |= code << curBits;
    curBits += size;
    while (curBits >= 8) {
      out.push(cur & 0xff);
      cur >>= 8;
      curBits -= 8;
    }
  };

  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict = new Map<string, number>();
  let next = eoiCode + 1;
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
    next = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };

  resetDict();
  emit(clearCode, codeSize);
  let prev = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const combined = prev + "," + c;
    if (dict.has(combined)) {
      prev = combined;
    } else {
      emit(dict.get(prev)!, codeSize);
      dict.set(combined, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
      if (next >= 4096) {
        emit(clearCode, codeSize);
        resetDict();
      }
      prev = String(c);
    }
  }
  emit(dict.get(prev)!, codeSize);
  emit(eoiCode, codeSize);
  if (curBits > 0) out.push(cur & 0xff);
  return Uint8Array.from(out);
}

function subBlocks(data: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const end = Math.min(i + 255, data.length);
    out.push(end - i);
    for (let j = i; j < end; j++) out.push(data[j]);
  }
  out.push(0); // block terminator
  return out;
}

// ---------------------------------------------------------------- encode GIF

/** Codifica frames num GIF89a animado em loop. `delayMs` = atraso por frame. */
export function encodeGif(frames: GifFrameInput[], delayMs: number, loop = true): Blob {
  if (frames.length === 0) throw new Error("Sem frames para o GIF");
  const width = frames[0].width;
  const height = frames[0].height;
  const bytes: number[] = [];
  const w16 = (n: number) => {
    bytes.push(n & 0xff, (n >> 8) & 0xff);
  };

  // header
  "GIF89a".split("").forEach((c) => bytes.push(c.charCodeAt(0)));
  // logical screen descriptor: paleta global 256 cores (packed = 0xF7)
  w16(width);
  w16(height);
  bytes.push(0xf7, 0, 0);
  // global color table (256 × RGB)
  for (const [r, g, b] of PALETTE) bytes.push(r, g, b);
  // NETSCAPE loop
  if (loop) {
    bytes.push(0x21, 0xff, 0x0b);
    "NETSCAPE2.0".split("").forEach((c) => bytes.push(c.charCodeAt(0)));
    bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  const delayCs = Math.max(2, Math.round(delayMs / 10)); // centésimos de segundo
  const minCodeSize = 8;
  for (const frame of frames) {
    // graphic control extension (delay)
    bytes.push(0x21, 0xf9, 0x04, 0x00);
    w16(delayCs);
    bytes.push(0x00, 0x00);
    // image descriptor
    bytes.push(0x2c);
    w16(0);
    w16(0);
    w16(width);
    w16(height);
    bytes.push(0x00);
    // LZW data
    bytes.push(minCodeSize);
    const indices = quantizeFrame(frame);
    const lzw = lzwEncode(indices, minCodeSize);
    for (const b of subBlocks(lzw)) bytes.push(b);
  }
  bytes.push(0x3b); // trailer

  return new Blob([Uint8Array.from(bytes)], { type: "image/gif" });
}
