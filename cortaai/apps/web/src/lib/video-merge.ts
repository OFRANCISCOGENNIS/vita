// REAL client-side video concatenation (static-export safe, no dependencies).
//
// Each source file is played sequentially into a shared canvas (letterboxed at
// the largest common size), captured with canvas.captureStream(); audio is
// routed through WebAudio (MediaElementSource → MediaStreamDestination) and
// both tracks are recorded by MediaRecorder into a single WebM Blob
// (vp9/vp8 + opus, whatever the browser supports).
//
// Guard rails:
//  - durations are probed first; totals above `maxDurationSeconds` throw
//    MergeTooLongError BEFORE any recording starts (recording is realtime).
//  - browsers without MediaRecorder/captureStream throw MergeUnsupportedError
//    so callers can fall back honestly.
//  - cancelable via AbortSignal; all object URLs revoked, AudioContext closed,
//    tracks stopped in every path.

export class MergeUnsupportedError extends Error {
  constructor() {
    super("MediaRecorder/captureStream não suportados neste navegador");
    this.name = "MergeUnsupportedError";
  }
}

export class MergeTooLongError extends Error {
  totalSeconds: number;
  constructor(totalSeconds: number, maxSeconds: number) {
    super(`Duração total de ${Math.round(totalSeconds)}s excede o limite de ${maxSeconds}s`);
    this.name = "MergeTooLongError";
    this.totalSeconds = totalSeconds;
  }
}

export interface MergeProgress {
  /** 0-based index of the clip being recorded. */
  fileIndex: number;
  fileCount: number;
  /** 0-100 within the current clip. */
  filePct: number;
  /** 0-100 across the whole merge. */
  overallPct: number;
  stage: "preparando" | "gravando" | "finalizando";
}

export interface MergeResult {
  blob: Blob;
  durationSeconds: number;
  width: number;
  height: number;
  /** JPEG data URL captured from the first frame (project thumbnail). */
  posterDataUrl: string | null;
}

export interface MergeOptions {
  onProgress?: (p: MergeProgress) => void;
  signal?: AbortSignal;
  maxDurationSeconds?: number;
}

export function isMergeSupported(): boolean {
  if (typeof window === "undefined") return false;
  const hasRecorder = typeof window.MediaRecorder !== "undefined";
  const hasCapture =
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream === "function";
  const hasAudio =
    typeof window.AudioContext !== "undefined" ||
    typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined";
  return hasRecorder && hasCapture && hasAudio;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("União cancelada", "AbortError");
}

interface ClipMeta {
  file: File;
  url: string;
  video: HTMLVideoElement;
  duration: number;
  width: number;
  height: number;
}

function loadClip(file: File): Promise<ClipMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    let settled = false;
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail(`Tempo esgotado ao ler "${file.name}"`), 15000);
    video.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      resolve({ file, url, video, duration, width: video.videoWidth || 640, height: video.videoHeight || 360 });
    };
    video.onerror = () => {
      clearTimeout(timer);
      fail(`Não foi possível ler "${file.name}"`);
    };
    video.src = url;
  });
}

function pickMimeType(): string {
  const preferred = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of preferred) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* isTypeSupported may itself throw on exotic UAs */
    }
  }
  return "";
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Merge multiple video files into ONE WebM blob. Sequential, realtime
 * (recording cannot run faster than playback), UI-safe (all work is
 * event/rAF-driven).
 */
export async function mergeVideos(files: File[], opts: MergeOptions = {}): Promise<MergeResult> {
  const { onProgress, signal } = opts;
  const maxDuration = opts.maxDurationSeconds ?? 600;
  if (!isMergeSupported()) throw new MergeUnsupportedError();
  if (files.length < 2) throw new Error("Selecione pelo menos 2 vídeos para unir");

  onProgress?.({ fileIndex: 0, fileCount: files.length, filePct: 0, overallPct: 0, stage: "preparando" });

  const clips: ClipMeta[] = [];
  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let canvasStream: MediaStream | null = null;
  let rafHandle = 0;
  let rvfcVideo: VideoWithRvfc | null = null;
  let rvfcHandle = 0;

  const cleanup = () => {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    if (rvfcVideo && rvfcHandle && rvfcVideo.cancelVideoFrameCallback) {
      try {
        rvfcVideo.cancelVideoFrameCallback(rvfcHandle);
      } catch {
        /* ignore */
      }
    }
    for (const c of clips) {
      try {
        c.video.pause();
        c.video.removeAttribute("src");
        c.video.load();
        URL.revokeObjectURL(c.url);
      } catch {
        /* ignore */
      }
    }
    canvasStream?.getTracks().forEach((t) => t.stop());
    if (audioCtx) void audioCtx.close().catch(() => undefined);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
  };

  try {
    // 1) Probe every clip (metadata only) and enforce the duration cap.
    for (const f of files) {
      throwIfAborted(signal);
      clips.push(await loadClip(f));
    }
    const totalDuration = clips.reduce((s, c) => s + c.duration, 0);
    if (totalDuration > maxDuration) throw new MergeTooLongError(totalDuration, maxDuration);

    // 2) Target canvas: largest common size, downscaled to <=1280 on the
    //    longest edge, even dimensions (encoder friendliness).
    let targetW = Math.max(...clips.map((c) => c.width));
    let targetH = Math.max(...clips.map((c) => c.height));
    const scale = Math.min(1, 1280 / Math.max(targetW, targetH));
    targetW = Math.max(2, Math.round((targetW * scale) / 2) * 2);
    targetH = Math.max(2, Math.round((targetH * scale) / 2) * 2);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MergeUnsupportedError();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, targetW, targetH);

    // 3) Audio graph: every clip's element feeds one MediaStreamDestination.
    //    (MediaElementSource reroutes output, so nothing plays out loud.)
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtor();
    await audioCtx.resume().catch(() => undefined);
    const dest = audioCtx.createMediaStreamDestination();
    for (const c of clips) {
      try {
        audioCtx.createMediaElementSource(c.video).connect(dest);
      } catch {
        /* clip without decodable audio — video still merges */
      }
    }

    // 4) Recorder over canvas video + mixed audio.
    canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    const mimeType = pickMimeType();
    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(combined, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 4_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder!.onstop = () => resolve();
      recorder!.onerror = () => resolve();
    });
    recorder.start(500);

    let posterDataUrl: string | null = null;
    const doneBefore: number[] = [];
    {
      let acc = 0;
      for (const c of clips) {
        doneBefore.push(acc);
        acc += c.duration;
      }
    }

    // 5) Play each clip into the canvas, sequentially.
    for (let i = 0; i < clips.length; i++) {
      throwIfAborted(signal);
      const clip = clips[i];
      const v = clip.video as VideoWithRvfc;
      const fit = Math.min(targetW / clip.width, targetH / clip.height);
      const dw = Math.round(clip.width * fit);
      const dh = Math.round(clip.height * fit);
      const dx = Math.round((targetW - dw) / 2);
      const dy = Math.round((targetH - dh) / 2);

      const draw = () => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, targetW, targetH);
        try {
          ctx.drawImage(v, dx, dy, dw, dh);
        } catch {
          /* transient decode gap — keep previous frame */
        }
        if (!posterDataUrl && v.currentTime > 0.05) {
          try {
            posterDataUrl = canvas.toDataURL("image/jpeg", 0.72);
          } catch {
            posterDataUrl = null;
          }
        }
      };

      v.currentTime = 0;
      v.muted = false; // audio flows through the WebAudio graph, not speakers
      v.volume = 1;
      await v.play().catch(() => undefined);

      await new Promise<void>((resolve, reject) => {
        let finished = false;
        let lastTime = -1;
        let lastAdvanceAt = Date.now();
        const finish = () => {
          if (finished) return;
          finished = true;
          v.pause();
          resolve();
        };
        const onAbort = () => {
          if (finished) return;
          finished = true;
          v.pause();
          reject(new DOMException("União cancelada", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        v.onended = finish;

        const tick = () => {
          if (finished) return;
          draw();
          const t = v.currentTime;
          if (t > lastTime + 0.01) {
            lastTime = t;
            lastAdvanceAt = Date.now();
          } else if (Date.now() - lastAdvanceAt > 8000) {
            finish(); // stalled decode — move on instead of hanging forever
            return;
          }
          const filePct = clip.duration > 0 ? Math.min(100, (t / clip.duration) * 100) : 100;
          const overallPct =
            totalDuration > 0 ? Math.min(99, ((doneBefore[i] + t) / totalDuration) * 100) : 0;
          onProgress?.({ fileIndex: i, fileCount: clips.length, filePct, overallPct, stage: "gravando" });
          if (clip.duration > 0 && t >= clip.duration - 0.06) {
            finish();
            return;
          }
          if (v.requestVideoFrameCallback) {
            rvfcVideo = v;
            rvfcHandle = v.requestVideoFrameCallback(tick);
          } else {
            rafHandle = requestAnimationFrame(tick);
          }
        };
        tick();
      });
    }

    // 6) Finalize the recording.
    onProgress?.({
      fileIndex: clips.length - 1,
      fileCount: clips.length,
      filePct: 100,
      overallPct: 99,
      stage: "finalizando",
    });
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    if (blob.size === 0) throw new Error("A gravação resultou em um arquivo vazio");
    onProgress?.({
      fileIndex: clips.length - 1,
      fileCount: clips.length,
      filePct: 100,
      overallPct: 100,
      stage: "finalizando",
    });
    return {
      blob,
      durationSeconds: Math.round(totalDuration * 100) / 100,
      width: targetW,
      height: targetH,
      posterDataUrl,
    };
  } finally {
    cleanup();
  }
}
