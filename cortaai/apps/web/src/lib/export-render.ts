// EXPORTAÇÃO FINAL 100% NO NAVEGADOR (WebCodecs).
//
// Renderiza o clipe frame a frame num canvas com as edições queimadas —
// recorte in/out, reenquadramento/proporção, correção de cor + filtros +
// camada de ajuste, velocidade (remapeamento de tempo real), legendas do
// transcript, headline, stickers, barra de progresso e marca d'água — e
// encoda com VideoEncoder/AudioEncoder, muxando localmente (mp4-muxer /
// webm-muxer). Sem servidor, sem chave, sem fila fake.
//
// Ordem de codec: H.264+AAC (MP4) → VP9+Opus (WebM) → VP8+Opus (WebM),
// conforme o suporte real do navegador (isConfigSupported).

import type { Cut } from "./types";
import type { EditorDoc } from "@/store/editor";
import {
  adjustmentFilter,
  colorGradeToFilter,
  filterCss,
  reframeAt,
  reframeWindow,
  speedAt,
  stickerPos,
} from "./edit-visuals";
import { getMedia } from "./media-store";

export interface ExportProgress {
  pct: number; // 0-100
  message: string;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  fileName: string;
}

export function isExportSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

const ASPECT_RATIOS: Record<string, number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "16:9": 16 / 9,
  "4:5": 4 / 5,
};

/** Dimensões de saída (pares) para a proporção do doc e o "lado curto" pedido. */
export function exportDimensions(aspect: string, shortSide: number): { width: number; height: number } {
  const ratio = ASPECT_RATIOS[aspect] ?? 9 / 16;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (ratio <= 1) {
    const width = even(shortSide);
    return { width, height: even(width / ratio) };
  }
  const height = even(shortSide);
  return { width: even(height * ratio), height };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Exportação cancelada", "AbortError");
}

function slugFile(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "clipe"
  );
}

// ------------------------------------------------------------- codec picking

export interface CodecPlan {
  container: "mp4" | "webm";
  videoCodec: string; // WebCodecs string
  audioCodec: string | null;
  mimeType: string;
  ext: string;
}

export async function pickCodecs(
  width: number,
  height: number,
  wantAudio: boolean,
  prefer?: "auto" | "mp4" | "webm",
): Promise<CodecPlan> {
  const tryVideo = async (codec: string) => {
    try {
      const res = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 6_000_000 });
      return res.supported === true;
    } catch {
      return false;
    }
  };
  const tryAudio = async (codec: string, sampleRate: number) => {
    if (typeof AudioEncoder === "undefined") return false;
    try {
      const res = await AudioEncoder.isConfigSupported({ codec, sampleRate, numberOfChannels: 2, bitrate: 128_000 });
      return res.supported === true;
    } catch {
      return false;
    }
  };

  // MP4 (H.264 + AAC) — o mais compatível para redes sociais. Acima de 1080p
  // tenta perfis High com nível maior (1440p/4K/8K); mantém Baseline 3.1 como
  // padrão para ≤1080p (comportamento validado). Se nenhum H.264 servir na
  // resolução pedida, cai para VP9/WebM (que suporta 4K/8K).
  const px = width * height;
  if (prefer !== "webm") {
    const h264Candidates: string[] = [];
    if (px > 2_100_000) h264Candidates.push("avc1.640033", "avc1.64002a"); // High L5.1 / L4.2
    h264Candidates.push("avc1.42001f"); // Baseline L3.1
    for (const codec of h264Candidates) {
      if (await tryVideo(codec)) {
        const aacOk = !wantAudio || (await tryAudio("mp4a.40.2", 48000));
        if (aacOk) {
          return { container: "mp4", videoCodec: codec, audioCodec: wantAudio ? "mp4a.40.2" : null, mimeType: "video/mp4", ext: "mp4" };
        }
      }
    }
    if (prefer === "mp4") {
      throw new Error("Este navegador não codifica MP4 (H.264) nessa resolução — exporte em WebM, que toca em qualquer player");
    }
  }
  // WebM (VP9/VP8 + Opus) — sempre presente no Chromium.
  const opusOk = !wantAudio || (await tryAudio("opus", 48000));
  if ((await tryVideo("vp09.00.10.08")) && opusOk) {
    return { container: "webm", videoCodec: "vp09.00.10.08", audioCodec: wantAudio ? "opus" : null, mimeType: "video/webm", ext: "webm" };
  }
  if ((await tryVideo("vp8")) && opusOk) {
    return { container: "webm", videoCodec: "vp8", audioCodec: wantAudio ? "opus" : null, mimeType: "video/webm", ext: "webm" };
  }
  throw new Error("Nenhum codec de exportação é suportado neste navegador");
}

// ------------------------------------------------------------- frame drawing

interface DrawCtx {
  cut: Cut;
  doc: EditorDoc;
  width: number;
  height: number;
}

function combinedFilter(doc: EditorDoc): string {
  const parts = [
    colorGradeToFilter(doc.colorGrade),
    filterCss(doc.filter.id, doc.filter.intensity)?.filter ?? "",
    adjustmentFilter(doc.adjustment),
  ]
    .map((f) => (f && f !== "none" ? f.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "none";
}

/** Desenha um frame completo (mídia + camadas) no canvas de exportação. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  d: DrawCtx,
  relSeconds: number, // tempo relativo ao início do CUT (domínio da origem)
  outFraction: number, // 0..1 do clipe exportado (para a barra de progresso)
): void {
  const { doc, cut, width, height } = d;
  ctx.save();
  ctx.filter = "none";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  // --- mídia com cover + reenquadramento -----------------------------------
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw && vh) {
    // Janela visível da mídia (zoom/pan do reframe), depois cover no canvas.
    const win = reframeWindow(reframeAt(doc.reframe, relSeconds));
    let sx = win.x * vw;
    let sy = win.y * vh;
    let sw = win.w * vw;
    let sh = win.h * vh;
    // cover: recorta a janela para casar com a proporção do canvas
    const target = width / height;
    const current = sw / sh;
    if (current > target) {
      const newSw = sh * target;
      sx += (sw - newSw) / 2;
      sw = newSw;
    } else if (current < target) {
      const newSh = sw / target;
      sy += (sh - newSh) / 2;
      sh = newSh;
    }
    ctx.filter = combinedFilter(doc);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
    ctx.filter = "none";

    // Tint overlay do filtro estilizado (fade/retrô/etc.)
    const overlay = filterCss(doc.filter.id, doc.filter.intensity)?.overlay;
    if (overlay) {
      ctx.save();
      ctx.globalAlpha = overlay.opacity;
      ctx.globalCompositeOperation = (overlay.blend as GlobalCompositeOperation) || "source-over";
      ctx.fillStyle = overlay.color;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  const scale = height / 1920;

  // --- headline -------------------------------------------------------------
  if (doc.layers.headlineEnabled && doc.layers.headlineText) {
    const px = Math.max(16, 44 * scale * 2.2);
    ctx.font = `800 ${px}px ${doc.captionStyle.font || "Inter"}, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = Math.max(2, px * 0.12);
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.fillStyle = "#ffffff";
    wrapText(ctx, doc.layers.headlineText, width / 2, height * 0.07, width * 0.86, px * 1.15, true);
  }

  // --- legendas do transcript -----------------------------------------------
  const absT = cut.startSeconds + relSeconds;
  const words = (cut.transcript ?? []).filter((w) => Math.abs(w.start - absT) < 1.6).slice(0, 5);
  if (words.length > 0) {
    const st = doc.captionStyle;
    const px = Math.max(14, st.sizePx * scale * 2.4);
    const text = st.censorProfanity ? words.map((w) => w.word).join(" ") : words.map((w) => w.word).join(" ");
    const y = st.position === "topo" ? height * 0.16 : st.position === "centro" ? height * 0.5 : height * 0.8;
    const upper = doc.captionPreset === "hormozi";
    ctx.font = `${doc.captionPreset === "minimal" ? 600 : 800} ${px}px ${st.font || "Inter"}, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const display = upper ? text.toUpperCase() : text;
    const lines = layoutLines(ctx, display, width * 0.84);
    const lineH = px * 1.18;
    let startY = y - ((lines.length - 1) * lineH) / 2;

    // caixa de fundo (preset highlight-box)
    if (doc.captionPreset === "highlightBox") {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      for (let i = 0; i < lines.length; i++) {
        const wpx = ctx.measureText(lines[i]).width;
        ctx.fillRect(width / 2 - wpx / 2 - px * 0.4, startY + i * lineH - lineH / 2, wpx + px * 0.8, lineH);
      }
      ctx.restore();
    }
    if (st.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = px * 0.25;
      ctx.shadowOffsetY = px * 0.06;
    }
    for (let i = 0; i < lines.length; i++) {
      if (st.outline) {
        ctx.lineWidth = Math.max(2, px * 0.14);
        ctx.strokeStyle = "#000";
        ctx.strokeText(lines[i], width / 2, startY + i * lineH);
      }
      ctx.fillStyle = st.color || "#facc15";
      ctx.fillText(lines[i], width / 2, startY + i * lineH);
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    void startY;
  }

  // --- stickers ---------------------------------------------------------------
  if (doc.layers.stickersEnabled !== false) {
    for (const s of doc.stickers ?? []) {
      const pos = stickerPos(s, relSeconds);
      const px = Math.max(20, 80 * scale * (s.scale || 1));
      ctx.font = `${px}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.content, pos.x * width, pos.y * height);
    }
  }

  // --- barra de progresso ------------------------------------------------------
  if (doc.layers.progressBarEnabled) {
    const barH = Math.max(4, 8 * scale);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(0, height - barH, width, barH);
    ctx.fillStyle = "#8b5cf6";
    ctx.fillRect(0, height - barH, width * Math.min(1, Math.max(0, outFraction)), barH);
  }

  // --- marca d'água -------------------------------------------------------------
  if (doc.layers.watermarkEnabled) {
    const px = Math.max(12, 26 * scale);
    ctx.font = `700 ${px}px Inter, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("✂ CortaAí", width - px * 0.8, px * 0.8);
  }

  ctx.restore();
}

/** Quebra o texto em linhas que caibam em maxWidth (fonte já setada no ctx). */
function layoutLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  stroke: boolean,
): void {
  const lines = layoutLines(ctx, text, maxWidth);
  lines.forEach((l, i) => {
    if (stroke) ctx.strokeText(l, x, y + i * lineHeight);
    ctx.fillText(l, x, y + i * lineHeight);
  });
}

// ------------------------------------------------------------- media loading

async function resolveMediaUrl(cut: Cut): Promise<{ url: string; owned: boolean; blob: Blob | null }> {
  if (cut.mediaId) {
    const blob = await getMedia(cut.mediaId);
    if (blob) return { url: URL.createObjectURL(blob), owned: true, blob };
  }
  if (cut.mediaUrl) return { url: cut.mediaUrl, owned: false, blob: null };
  throw new Error("Este clipe não tem mídia reproduzível neste navegador");
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.setAttribute("playsinline", "");
    const timer = setTimeout(() => reject(new Error("Tempo esgotado ao carregar a mídia")), 20_000);
    v.onloadeddata = () => {
      clearTimeout(timer);
      resolve(v);
    };
    v.onerror = () => {
      clearTimeout(timer);
      reject(new Error("O navegador não conseguiu decodificar esta mídia"));
    };
    v.src = url;
  });
}

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, 1500); // codecs que não disparam seeked
    v.addEventListener("seeked", () => {
      clearTimeout(timer);
      done();
    });
    try {
      v.currentTime = Math.max(0, t);
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

// ------------------------------------------------------------- audio pipeline

/**
 * Prepara o áudio do trecho exportado: recorte, velocidade (taxa média para
 * ramps), fades e reamostragem para 48kHz estéreo. Null = exportar sem áudio.
 */
async function prepareAudio(
  mediaBlob: Blob | null,
  mediaUrl: string,
  startAbs: number,
  srcDuration: number,
  outDuration: number,
  doc: EditorDoc,
): Promise<AudioBuffer | null> {
  try {
    let bytes: ArrayBuffer | null = null;
    if (mediaBlob) bytes = await mediaBlob.arrayBuffer();
    else {
      const res = await fetch(mediaUrl);
      if (res.ok) bytes = await res.arrayBuffer();
    }
    if (!bytes) return null;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const decodeCtx = new AC();
    let decoded: AudioBuffer;
    try {
      decoded = await decodeCtx.decodeAudioData(bytes);
    } finally {
      void decodeCtx.close().catch(() => undefined);
    }
    if (decoded.duration < 0.2) return null;

    const sampleRate = 48000;
    const frames = Math.max(1, Math.ceil(outDuration * sampleRate));
    const offline = new OfflineAudioContext(2, frames, sampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    // Velocidade: taxa média do trecho (ramps são aproximados na trilha de áudio).
    const avgRate = srcDuration / Math.max(0.001, outDuration);
    src.playbackRate.value = Math.min(4, Math.max(0.25, avgRate));

    const gain = offline.createGain();
    const fadeIn = Math.min(doc.audioAdvanced.fadeInSec ?? 0, outDuration / 2);
    const fadeOut = Math.min(doc.audioAdvanced.fadeOutSec ?? 0, outDuration / 2);
    gain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : 1, 0);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, fadeIn);
    if (fadeOut > 0) {
      gain.gain.setValueAtTime(1, Math.max(0, outDuration - fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, outDuration);
    }

    src.connect(gain).connect(offline.destination);
    src.start(0, Math.max(0, startAbs), Math.min(srcDuration + 0.05, Math.max(0.05, decoded.duration - startAbs)));
    return await offline.startRendering();
  } catch {
    return null; // mídia sem trilha de áudio decodificável → vídeo mudo
  }
}

// ------------------------------------------------------------- main pipeline

export async function renderCutToBlob(
  cut: Cut,
  doc: EditorDoc,
  opts: {
    shortSide: number; // 720 | 1080 | 2160
    fps: number;
    onProgress?: (p: ExportProgress) => void;
    signal?: AbortSignal;
  },
): Promise<ExportResult> {
  if (!isExportSupported()) throw new Error("Este navegador não suporta renderização local (WebCodecs)");
  const report = (pct: number, message: string) =>
    opts.onProgress?.({ pct: Math.max(0, Math.min(100, Math.round(pct))), message });

  const { width, height } = exportDimensions(doc.aspect, opts.shortSide);
  const fps = opts.fps;

  report(1, "Carregando a mídia…");
  const media = await resolveMediaUrl(cut);
  const video = await loadVideo(media.url);
  throwIfAborted(opts.signal);

  // Trecho exportado (domínio da origem, relativo ao início do cut).
  const cutLen = cut.endSeconds - cut.startSeconds;
  const inRel = Math.max(0, doc.inPoint ?? 0);
  const outRel = Math.min(cutLen, doc.outPoint ?? cutLen);
  if (outRel - inRel < 0.2) throw new Error("O trecho selecionado é curto demais");

  // Remapeamento de tempo (velocidade): tabela rel(origem) por frame de SAÍDA.
  const frameTimes: number[] = [];
  let rel = inRel;
  const maxFrames = fps * 60 * 20; // trava de segurança (20 min)
  while (rel < outRel && frameTimes.length < maxFrames) {
    frameTimes.push(rel);
    const rate = Math.min(4, Math.max(0.25, speedAt(doc.speed, rel)));
    rel += rate / fps;
  }
  const totalFrames = frameTimes.length;
  if (totalFrames === 0) throw new Error("Nada para exportar");
  const outDuration = totalFrames / fps;
  const srcDuration = outRel - inRel;

  report(3, "Preparando o áudio…");
  const audioBuffer = doc.audio ? await prepareAudio(media.blob, media.url, cut.startSeconds + inRel, srcDuration, outDuration, doc) : null;
  throwIfAborted(opts.signal);

  report(5, "Escolhendo o codec…");
  const plan = await pickCodecs(width, height, audioBuffer != null);

  // Muxer + encoders --------------------------------------------------------
  const fileBase = slugFile(cut.title);
  let finalizeAndGetBuffer: () => ArrayBuffer;
  let addVideoChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
  let addAudioChunk: ((chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void) | null = null;

  if (plan.container === "mp4") {
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width, height },
      ...(plan.audioCodec ? { audio: { codec: "aac", sampleRate: 48000, numberOfChannels: 2 } } : {}),
      fastStart: "in-memory",
    });
    addVideoChunk = (c, m) => muxer.addVideoChunk(c, m);
    if (plan.audioCodec) addAudioChunk = (c, m) => muxer.addAudioChunk(c, m);
    finalizeAndGetBuffer = () => {
      muxer.finalize();
      return target.buffer;
    };
  } else {
    const { Muxer, ArrayBufferTarget } = await import("webm-muxer");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: plan.videoCodec.startsWith("vp09") ? "V_VP9" : "V_VP8", width, height, frameRate: fps },
      ...(plan.audioCodec ? { audio: { codec: "A_OPUS", sampleRate: 48000, numberOfChannels: 2 } } : {}),
    });
    addVideoChunk = (c, m) => muxer.addVideoChunk(c, m);
    if (plan.audioCodec) addAudioChunk = (c, m) => muxer.addAudioChunk(c, m);
    finalizeAndGetBuffer = () => {
      muxer.finalize();
      return target.buffer as ArrayBuffer;
    };
  }

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  videoEncoder.configure({
    codec: plan.videoCodec,
    width,
    height,
    bitrate: Math.min(12_000_000, Math.round(width * height * fps * 0.12)),
    framerate: fps,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioBuffer && plan.audioCodec && addAudioChunk) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => addAudioChunk!(chunk, meta),
      error: (e) => {
        encodeError = e;
      },
    });
    audioEncoder.configure({ codec: plan.audioCodec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 });
  }

  // Canvas de composição ------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("Canvas 2D indisponível");
  const dctx: DrawCtx = { cut, doc, width, height };

  // Loop de vídeo --------------------------------------------------------------
  for (let i = 0; i < totalFrames; i++) {
    throwIfAborted(opts.signal);
    if (encodeError) throw encodeError;
    const relT = frameTimes[i];
    await seekTo(video, cut.startSeconds + relT);
    drawFrame(ctx, video, dctx, relT, i / Math.max(1, totalFrames - 1));
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // Backpressure: não deixa a fila do encoder crescer sem limite.
    while (videoEncoder.encodeQueueSize > 3) {
      await new Promise((r) => setTimeout(r, 4));
      if (encodeError) throw encodeError;
    }
    if (i % 5 === 0 || i === totalFrames - 1) {
      report(6 + (i / totalFrames) * 78, `Renderizando quadro ${i + 1} de ${totalFrames}…`);
    }
  }

  // Áudio ----------------------------------------------------------------------
  if (audioBuffer && audioEncoder) {
    report(86, "Codificando o áudio…");
    const chunkFrames = 1024;
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
    for (let offset = 0; offset < audioBuffer.length; offset += chunkFrames) {
      throwIfAborted(opts.signal);
      if (encodeError) throw encodeError;
      const len = Math.min(chunkFrames, audioBuffer.length - offset);
      const interleaved = new Float32Array(len * 2);
      for (let j = 0; j < len; j++) {
        interleaved[j * 2] = ch0[offset + j];
        interleaved[j * 2 + 1] = ch1[offset + j];
      }
      const data = new AudioData({
        format: "f32",
        sampleRate: 48000,
        numberOfFrames: len,
        numberOfChannels: 2,
        timestamp: Math.round((offset / 48000) * 1e6),
        data: interleaved,
      });
      audioEncoder.encode(data);
      data.close();
      while (audioEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 4));
      }
    }
  }

  report(92, "Finalizando o arquivo…");
  await videoEncoder.flush();
  videoEncoder.close();
  if (audioEncoder) {
    await audioEncoder.flush();
    audioEncoder.close();
  }
  if (encodeError) throw encodeError;
  const buffer = finalizeAndGetBuffer();

  if (media.owned) {
    try {
      URL.revokeObjectURL(media.url);
    } catch {
      /* ignore */
    }
  }
  video.removeAttribute("src");
  try {
    video.load();
  } catch {
    /* ignore */
  }

  report(100, "Exportação concluída");
  return {
    blob: new Blob([buffer], { type: plan.mimeType }),
    mimeType: plan.mimeType,
    fileName: `${fileBase}.${plan.ext}`,
  };
}
